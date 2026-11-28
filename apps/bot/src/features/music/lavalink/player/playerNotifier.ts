import { UserError } from '@sapphire/framework';
import { ILogObj, Logger } from 'tslog';
import { getConfig } from '../../../../lib/config.ts';
import type { Stoppable } from '../../../../lib/lifecycle.ts';
import { ChatInputCommandInteraction, MessageFlags, type Message } from 'discord.js';
import { emoji, enqueueOperation } from '@sirubot/utils';

import { CustomPlayer } from './customPlayer.ts';
import { nowPlayingTrack } from './nowPlaying.ts';
import { buildControllerCardPayload } from './controllerPayload.ts';
import { clearNowPlayingCard, getCachedNowPlayingCard, getNowPlayingCardKey, resolveNowPlayingCard } from './nowPlayingCard.ts';
import type { LavalinkDeps } from '../deps.ts';
import { normalizeTrackEncoded } from '../trackEncoded.ts';
import { Guild } from '@sirubot/prisma';
import { panelIdleView } from '../../discord/views/panelIdle.ts';
import { withGuildTheme } from '../../../../lib/guildTheme.ts';
import { thrownCode, thrownMessage } from '../../../../lib/thrownError.ts';
import * as guildChannels from '../../../../services/guildSettings/channels.ts';

type ControllerOptions = Pick<Guild, 'enableController' | 'volume'>;

export class PlayerNotifier implements Stoppable {
	public readonly name = '플레이어 컨트롤러 갱신';
	private stopped = false;
	private logger: Logger<ILogObj>;
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
	private readonly sendChains: Map<string, Promise<void>> = new Map();
	private readonly pendingUpdates = new Map<string, CustomPlayer>();
	private readonly updateDrainQueued = new Set<string>();
	private readonly updateRevisions = new Map<string, number>();
	private readonly cardRefreshes = new Map<string, { messageId: string; trackKey: string }>();
	private readonly renderedSignatures = new WeakMap<Message, string>();
	private readonly cardTrackKeys = new WeakMap<Message, string>();
	private readonly progressTicks = new Map<string, NodeJS.Timeout>();
	private readonly controllerVersions = new WeakMap<CustomPlayer, number>();
	private readonly destroyedPlayers = new WeakSet<CustomPlayer>();
	/** Only the newest send per guild runs; older queued sends are skipped. Slash replies are tracked apart so an automatic send never swallows one. */
	private readonly latestSendTickets = new Map<string, { any: number; interaction: number }>();
	private readonly queuedSends = new Map<string, number>();
	private sendTicketSequence = 0;

	private get DEBOUNCE_MS(): number {
		return getConfig().notifier.debounceMs;
	}
	private get PROGRESS_TICK_MS(): number {
		return getConfig().notifier.progressTickMs;
	}
	private get OPERATION_TIMEOUT_MS(): number {
		return getConfig().notifier.operationTimeoutMs;
	}

	constructor(private readonly deps: LavalinkDeps) {
		this.logger = deps.logger.getSubLogger({ name: 'playerNotifier' });
	}

	private async idleView(guildId: string) {
		const guild = await this.deps.guildService.getGuild(guildId);
		const recent = await this.fetchRecentTracks(guildId);
		return withGuildTheme(
			guildId,
			async () => guild.themePreset,
			() =>
				panelIdleView({
					inputPlay: guild.textChannelInputPlay,
					inputMode: guild.textChannelMode === 'select' ? 'select' : 'play',
					deleteInput: guild.textChannelDeleteInput,
					djRoleId: guild.djRoleId,
					recent,
					dashboardUrl: getConfig().links.dashboardUrl,
					guildId
				}),
			{ fresh: true }
		);
	}

	private async fetchRecentTracks(guildId: string) {
		try {
			return await this.deps.trackService.getRecentGuildTracks(guildId, 5);
		} catch (error) {
			this.logger.warn(`Failed to load recent tracks for guild ${guildId}:`, error);
			return [];
		}
	}

	public sendController(player: CustomPlayer, interaction?: ChatInputCommandInteraction): Promise<void> {
		const { guildId } = player;
		const version = this.controllerVersions.get(player) ?? 0;
		const ticket = this.nextSendTicket(guildId, Boolean(interaction));
		this.queuedSends.set(guildId, (this.queuedSends.get(guildId) ?? 0) + 1);
		return this.enqueueControllerOperation(guildId, 'send', async () => {
			this.decrementQueuedSends(guildId);
			await this.sendControllerNow(player, interaction, version, ticket);
		});
	}

	private decrementQueuedSends(guildId: string): void {
		const remaining = (this.queuedSends.get(guildId) ?? 1) - 1;
		if (remaining > 0) this.queuedSends.set(guildId, remaining);
		else this.queuedSends.delete(guildId);
	}

	private nextSendTicket(guildId: string, forInteraction: boolean): number {
		const ticket = ++this.sendTicketSequence;
		const latest = this.latestSendTickets.get(guildId) ?? { any: 0, interaction: 0 };
		this.latestSendTickets.set(guildId, { any: ticket, interaction: forInteraction ? ticket : latest.interaction });
		return ticket;
	}

	private isSuperseded(guildId: string, ticket: number, forInteraction: boolean): boolean {
		const latest = this.latestSendTickets.get(guildId);
		if (!latest) return false;
		return forInteraction ? latest.interaction !== ticket : latest.any !== ticket;
	}

	/** A stuck Discord call (e.g. a long 429 wait) must not freeze every later controller change in the guild. */
	private enqueueControllerOperation(guildId: string, label: string, operation: () => Promise<void>): Promise<void> {
		return enqueueOperation(this.sendChains, guildId, () => {
			const run = operation();
			let timer: NodeJS.Timeout | undefined;
			const timeout = new Promise<void>((resolve) => {
				timer = setTimeout(() => {
					this.logger.warn(`Controller ${label} for guild ${guildId} exceeded ${this.OPERATION_TIMEOUT_MS}ms; releasing the queue`);
					resolve();
				}, this.OPERATION_TIMEOUT_MS);
				timer.unref?.();
			});
			return Promise.race([run, timeout]).finally(() => clearTimeout(timer));
		});
	}

	private canSend(player: CustomPlayer, version: number, interaction?: ChatInputCommandInteraction): boolean {
		if (!this.destroyedPlayers.has(player) && (this.controllerVersions.get(player) ?? 0) === version) return true;
		if (interaction) {
			throw new UserError({
				identifier: 'nowplaying_state_changed',
				message: `${emoji('info')} 재생 상태가 바뀌었어요. \`/현재곡\`으로 다시 확인해 주세요.`,
				context: { ephemeral: true }
			});
		}
		return false;
	}

	private async sendControllerNow(
		player: CustomPlayer,
		interaction?: ChatInputCommandInteraction,
		version = this.controllerVersions.get(player) ?? 0,
		ticket = this.nextSendTicket(player.guildId, Boolean(interaction))
	): Promise<void> {
		const superseded = () => this.isSuperseded(player.guildId, ticket, Boolean(interaction));
		if (superseded()) {
			this.logger.debug(`Skipping superseded controller send for guild: ${player.guildId}`);
			if (interaction?.deferred) await interaction.deleteReply().catch(() => null);
			return;
		}
		this.logger.debug(`Sending new controller for guild: ${player.guildId}`);

		try {
			if (!this.canSend(player, version, interaction)) return;
			this.clearDebounceTimer(player.guildId);
			if (!interaction && !player.textChannelId) throw new Error(`Player has not textChannelId ${player.guildId}`);
			const options = await this.getControllerOptions(player.guildId);

			if (!options) {
				if (interaction) throw new Error(`Controller settings unavailable for guild ${player.guildId}`);
				return;
			}
			if (!options.enableController && !interaction) return;
			if (!this.canSend(player, version, interaction)) return;
			if (superseded()) {
				if (interaction?.deferred) await interaction.deleteReply().catch(() => null);
				return;
			}

			const pinnedPanel = interaction ? null : await this.fetchPanelMessage(player);
			if (pinnedPanel) {
				if (player.controller && player.controller.id !== pinnedPanel.id) await this.removeController(player);
				else this.resetControllerState(player);
			} else {
				await this.removeController(player);
			}
			if (!this.canSend(player, version, interaction)) return;

			const textChannelId = interaction?.channelId ?? player.textChannelId;
			const {
				pinned: pinnedChannel,
				card,
				components,
				files
			} = await buildControllerCardPayload(this.deps, player, {
				volume: options.volume,
				textChannelId
			});

			let message;
			if (interaction) {
				const payload = {
					components: [components],
					files,
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { roles: [], users: [] }
				} as const;
				if (interaction.deferred || interaction.replied) {
					message = await interaction.editReply(payload);
				} else {
					const response = await interaction.reply({
						...payload,
						flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
						withResponse: true
					});
					message = response.resource?.message ?? (await interaction.fetchReply());
				}
				player.textChannelId = interaction.channelId;
			} else {
				if (!player.textChannelId) return;
				const textChannel = this.deps.client.channels.cache.get(player.textChannelId);
				if (!textChannel?.isSendable()) return;
				if (pinnedPanel) {
					message = await pinnedPanel.edit({
						components: [components],
						attachments: [],
						files,
						flags: [MessageFlags.IsComponentsV2],
						allowedMentions: { roles: [], users: [] }
					});
				} else {
					message = await textChannel.send({
						components: [components],
						files,
						flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
						allowedMentions: { roles: [], users: [] }
					});
					if (pinnedChannel) await guildChannels.setTextMessage(this.deps.guildService, player.guildId, message.id).catch(() => null);
				}
			}

			const stale = this.destroyedPlayers.has(player) || (this.controllerVersions.get(player) ?? 0) !== version;
			// A newer send already owns the controller slot; drop this message instead of overwriting the newer one.
			if (stale || superseded()) {
				// The newer send edits the same panel message again, so keep it.
				const keepPanel = !stale && message.id === pinnedPanel?.id;
				if (!keepPanel) await (interaction ? interaction.deleteReply() : message.delete()).catch(() => null);
				if (stale) this.canSend(player, version, interaction);
				return;
			}
			player.messageId = message.id;
			player.controller = message;
			this.renderedSignatures.set(message, this.renderSignature(player, components));
			this.cardTrackKeys.set(message, card ? card.trackKey : '');
			if (pinnedChannel && !getCachedNowPlayingCard(this.deps, player)) this.startCardRefresh(player, message.id, Boolean(interaction));
			this.ensureProgressTick(player);
			this.logger.debug(`Created new controller message for guild: ${player.guildId}`);
		} catch (error) {
			this.logger.error(`Failed to send new controller for guild ${player.guildId}:`, error);
			if (interaction) {
				if (interaction.deferred) await interaction.deleteReply().catch(() => null);
				throw error;
			}
		}
	}

	public async stop(): Promise<void> {
		this.stopped = true;
		for (const timer of this.debounceTimers.values()) clearTimeout(timer);
		this.debounceTimers.clear();
		for (const timer of this.progressTicks.values()) clearInterval(timer);
		this.progressTicks.clear();
		this.pendingUpdates.clear();
	}

	private isOrphanPlayer(player: CustomPlayer): boolean {
		const live = this.deps.audio?.getPlayer?.(player.guildId);
		return Boolean(live) && live !== player;
	}

	public updateController(player: CustomPlayer): void {
		if (this.stopped) return;
		if (this.isOrphanPlayer(player)) {
			this.logger.warn(`Ignoring controller update from an orphaned player instance (guild ${player.guildId})`);
			return;
		}
		this.clearDebounceTimer(player.guildId);
		this.updateRevisions.set(player.guildId, (this.updateRevisions.get(player.guildId) ?? 0) + 1);
		this.pendingUpdates.set(player.guildId, player);

		const timer = setTimeout(() => {
			this.debounceTimers.delete(player.guildId);
			this.scheduleUpdateDrain(player.guildId);
		}, this.DEBOUNCE_MS);

		this.debounceTimers.set(player.guildId, timer);
	}

	/**
	 * Runs one edit per queue turn with the newest pending state. Updates that arrive meanwhile wait at the back of the
	 * queue behind any sends, so a stream of progress ticks can never starve a new controller.
	 */
	private scheduleUpdateDrain(guildId: string): void {
		if (this.updateDrainQueued.has(guildId)) return;
		this.updateDrainQueued.add(guildId);
		void this.enqueueControllerOperation(guildId, 'update', async () => {
			this.updateDrainQueued.delete(guildId);
			const player = this.pendingUpdates.get(guildId);
			if (!player) return;
			this.pendingUpdates.delete(guildId);
			// A queued send renders the newest state anyway.
			if (this.queuedSends.has(guildId)) return;
			await this.updateControllerNow(player, false, this.updateRevisions.get(guildId) ?? 0);
		})
			.catch((error) => this.logger.error(`Failed to update controller for guild ${guildId}:`, error))
			.finally(() => {
				if (this.pendingUpdates.has(guildId) && !this.debounceTimers.has(guildId)) this.scheduleUpdateDrain(guildId);
			});
	}

	/** Include track identity because card mode puts track info only in the attachment. */
	private renderSignature(player: CustomPlayer, components: { toJSON(): unknown }): string {
		const encoded = nowPlayingTrack(player)?.encoded;
		return `${typeof encoded === 'string' ? normalizeTrackEncoded(encoded) : ''}::${JSON.stringify(components.toJSON())}`;
	}

	private async updateControllerNow(player: CustomPlayer, allowDisabled = false, revision?: number): Promise<void> {
		const message = player.controller;
		const version = this.controllerVersions.get(player) ?? 0;
		if (!message || player.messageId !== message.id || !this.canSend(player, version)) return;
		try {
			const options = await this.getControllerOptions(player.guildId);
			if (!options || (!options.enableController && !allowDisabled)) return;
			if (!this.canSend(player, version) || player.messageId !== message.id || player.controller?.id !== message.id) return;
			const textChannelId = player.textChannelId;
			const {
				pinned: pinnedChannel,
				card,
				components,
				attachments,
				files
			} = await buildControllerCardPayload(this.deps, player, {
				volume: options.volume,
				textChannelId,
				message,
				previousTrackKey: this.cardTrackKeys.get(message) ?? ''
			});
			if (revision !== undefined && this.updateRevisions.get(player.guildId) !== revision) return;
			const missingCurrent = pinnedChannel && getCachedNowPlayingCard(this.deps, player) === null;
			const signature = this.renderSignature(player, components);
			if (files.length === 0 && this.renderedSignatures.get(message) === signature) {
				if (missingCurrent) this.startCardRefresh(player, message.id, allowDisabled);
				this.ensureProgressTick(player);
				return;
			}
			if (message.editable) {
				const edited = await message.edit({
					components: [components],
					attachments,
					files,
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { roles: [], users: [] }
				});
				if (!this.canSend(player, version) || player.messageId !== message.id) return;
				player.controller = edited;
				this.renderedSignatures.set(edited, signature);
				this.cardTrackKeys.set(edited, card ? card.trackKey : '');
				if (missingCurrent) this.startCardRefresh(player, message.id, allowDisabled);
				this.ensureProgressTick(player);
				this.logger.trace(`Updated controller message for guild: ${player.guildId}`);
			}
		} catch (error) {
			if (thrownCode(error) !== 10008) throw error;
			if (!this.canSend(player, version) || player.messageId !== message.id) return;
			this.logger.debug(`Unknown message error ignored while updating controller for guild ${player.guildId}`);
			if (
				player.textChannelId &&
				(await this.isPanelChannel(player.guildId, player.textChannelId)) &&
				this.canSend(player, version) &&
				player.messageId === message.id
			) {
				player.messageId = null;
				player.controller = null;
				// Already inside the serialized sendChain; calling sendController would deadlock.
				await this.sendControllerNow(player, undefined, version);
			}
		}
	}

	private startCardRefresh(player: CustomPlayer, messageId: string, allowDisabled: boolean): void {
		const trackKey = getNowPlayingCardKey(player);
		if (!trackKey) return;
		const previous = this.cardRefreshes.get(player.guildId);
		if (previous?.messageId === messageId && previous.trackKey === trackKey) return;
		const request = { messageId, trackKey };
		this.cardRefreshes.set(player.guildId, request);
		void resolveNowPlayingCard(this.deps, player)
			.then((card) => {
				if (!card) return;
				return this.enqueueControllerOperation(player.guildId, 'card refresh', async () => {
					if (this.cardRefreshes.get(player.guildId) !== request || player.messageId !== messageId) return;
					if (getNowPlayingCardKey(player) !== trackKey) return;
					await this.updateControllerNow(player, allowDisabled);
				});
			})
			.catch((error) => this.logger.warn(`Failed to attach controller card for guild ${player.guildId}:`, error))
			.finally(() => {
				if (this.cardRefreshes.get(player.guildId) === request) this.cardRefreshes.delete(player.guildId);
			});
	}

	private clearDebounceTimer(guildId: string): void {
		const timer = this.debounceTimers.get(guildId);
		if (timer) {
			clearTimeout(timer);
			this.debounceTimers.delete(guildId);
		}
	}

	private ensureProgressTick(player: CustomPlayer): void {
		if (this.stopped || this.progressTicks.has(player.guildId)) return;
		if (player.queue.current?.info.isStream === true) return;
		const timer = setInterval(() => {
			if (!player.queue.current || this.destroyedPlayers.has(player) || this.isOrphanPlayer(player)) {
				this.stopProgressTick(player.guildId);
				return;
			}
			if (!player.paused) this.updateController(player);
		}, this.PROGRESS_TICK_MS);
		timer.unref?.();
		this.progressTicks.set(player.guildId, timer);
	}

	private stopProgressTick(guildId: string): void {
		const timer = this.progressTicks.get(guildId);
		if (timer) {
			clearInterval(timer);
			this.progressTicks.delete(guildId);
		}
	}

	public async deleteController(player: CustomPlayer): Promise<void> {
		this.controllerVersions.set(player, (this.controllerVersions.get(player) ?? 0) + 1);
		await this.removeController(player);
	}

	private resetControllerState(player: CustomPlayer): { controllerMessage: Message | null; messageId: string | null } {
		this.clearDebounceTimer(player.guildId);
		this.pendingUpdates.delete(player.guildId);
		this.updateRevisions.set(player.guildId, (this.updateRevisions.get(player.guildId) ?? 0) + 1);
		this.cardRefreshes.delete(player.guildId);
		this.stopProgressTick(player.guildId);

		const controllerMessage = (player.controller as Message | null) ?? null;
		const messageId = player.messageId ?? null;

		// Clear refs before deleting so messageDeleted listener recognizes bot-initiated removal.
		player.messageId = null;
		player.controller = null;
		return { controllerMessage, messageId };
	}

	private async fetchPanelMessage(player: CustomPlayer): Promise<Message | null> {
		try {
			if (!player.textChannelId) return null;
			const [channelId, messageId] = await Promise.all([
				guildChannels.getPanelChannel(this.deps.guildService, player.guildId),
				guildChannels.getTextMessage(this.deps.guildService, player.guildId)
			]);
			if (!channelId || !messageId || channelId !== player.textChannelId) return null;
			const channel = this.deps.client.channels.cache.get(channelId);
			if (!channel?.isTextBased() || !('messages' in channel)) return null;
			const message = await channel.messages.fetch(messageId).catch(() => null);
			return message?.editable ? message : null;
		} catch {
			return null;
		}
	}

	public async syncPanel(guildId: string, previousChannelId: string | null): Promise<void> {
		await this.enqueueControllerOperation(guildId, 'panel sync', async () => {
			try {
				const oldMessageId = await guildChannels.getTextMessage(this.deps.guildService, guildId);
				const channelId = await guildChannels.getPanelChannel(this.deps.guildService, guildId);
				const player = this.deps.audio?.getPlayer?.(guildId);
				const playing = Boolean(player?.queue.current);

				if (channelId && oldMessageId && (previousChannelId === null || previousChannelId === channelId)) {
					if (playing) return;
					const channel = this.deps.client.channels.cache.get(channelId);
					if (channel?.isTextBased() && 'messages' in channel) {
						const existing = await channel.messages.fetch(oldMessageId).catch(() => null);
						if (existing?.editable) {
							await existing.edit({
								components: [await this.idleView(guildId)],
								attachments: [],
								files: [],
								flags: [MessageFlags.IsComponentsV2],
								allowedMentions: { roles: [], users: [] }
							});
							return;
						}
					}
				}

				// Clear stored ID before deleting so messageDelete doesn't recreate the panel.
				await guildChannels.setTextMessage(this.deps.guildService, guildId, null);
				const oldChannelId = previousChannelId ?? channelId ?? (await guildChannels.getDefaultTextChannel(this.deps.guildService, guildId));
				if (oldMessageId && oldChannelId) {
					const oldChannel = this.deps.client.channels.cache.get(oldChannelId);
					if (oldChannel?.isTextBased() && 'messages' in oldChannel) {
						await oldChannel.messages.delete(oldMessageId).catch(() => null);
					}
				}
				if (!channelId) {
					if (player && playing) await this.sendControllerNow(player);
					return;
				}
				const channel = this.deps.client.channels.cache.get(channelId);
				if (!channel?.isSendable()) return;
				if (player && playing) {
					player.textChannelId = channelId;
					await this.sendControllerNow(player);
					return;
				}
				const message = await channel.send({
					components: [await this.idleView(guildId)],
					flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
					allowedMentions: { roles: [], users: [] }
				});
				await guildChannels.setTextMessage(this.deps.guildService, guildId, message.id);
			} catch (error) {
				this.logger.warn(`Failed to sync panel for guild ${guildId}:`, error);
			}
		});
	}

	private warnUnlessUnknownMessage(player: CustomPlayer, error: unknown): void {
		if (thrownCode(error) === 10008) return;
		this.logger.warn(`Failed to delete controller message for guild ${player.guildId}: ${thrownMessage(error)}`);
	}

	private async removeController(player: CustomPlayer): Promise<void> {
		const { controllerMessage, messageId } = this.resetControllerState(player);

		if (controllerMessage?.deletable) {
			await controllerMessage.delete().catch((error: unknown) => this.warnUnlessUnknownMessage(player, error));
			return;
		}

		if (messageId && player.textChannelId) {
			const channel = this.deps.client.channels.cache.get(player.textChannelId);
			if (channel?.isSendable()) {
				const message = await channel.messages.fetch(messageId).catch(() => null);
				if (message?.deletable) {
					await message.delete().catch((error: unknown) => this.warnUnlessUnknownMessage(player, error));
				}
			}
		}
	}

	public async onTrackStart(player: CustomPlayer): Promise<void> {
		this.logger.debug(`Track started in guild: ${player.guildId}`);

		if (player.textChannelId && player.messageId) {
			if (await this.isPanelChannel(player.guildId, player.textChannelId)) {
				this.updateController(player);
				return;
			}
			const channel = this.deps.client.channels.cache.get(player.textChannelId);
			if (channel?.isSendable()) {
				if (channel.lastMessageId === player.messageId) {
					this.updateController(player);
					return;
				}
			}
		}

		// Track start must not wait for Discord; the queue posts the controller on its own.
		void this.sendController(player).catch((error) => this.logger.error(`Failed to send controller for guild ${player.guildId}:`, error));
	}

	public onPlayerUpdate(player: CustomPlayer): void {
		this.logger.trace(`Player updated in guild: ${player.guildId}`);

		if (!player.queue.current) {
			if (player.playing) {
				this.logger.debug(`onPlayerUpdate skipped: current is null while playing (guild ${player.guildId}), transition reconcile pending`);
			}
			return;
		}
		this.updateController(player);
	}

	public async onPlayerDestroy(player: CustomPlayer): Promise<void> {
		this.logger.debug(`Player destroyed in guild: ${player.guildId}`);
		this.destroyedPlayers.add(player);
		clearNowPlayingCard(this.deps, player.guildId);
		const panel = player.controller as Message | null;
		if (panel && player.textChannelId && panel.editable && (await this.isPanelChannel(player.guildId, player.textChannelId))) {
			this.controllerVersions.set(player, (this.controllerVersions.get(player) ?? 0) + 1);
			this.resetControllerState(player);
			const idleView = await this.idleView(player.guildId);
			void panel
				.edit({ components: [idleView], attachments: [], files: [], flags: [MessageFlags.IsComponentsV2] })
				.catch((error: { code?: number }) => {
					if (error.code !== 10008) this.logger.warn(`Failed to reset panel for guild ${player.guildId}:`, error);
				});
			return;
		}
		await this.deleteController(player);
	}

	private async getControllerOptions(guildId: string): Promise<ControllerOptions | null> {
		try {
			const data = await this.deps.guildService.getGuild(guildId);

			return data;
		} catch (error) {
			this.logger.error(`Failed to get controller options for guild ${guildId}:`, error);
			return null;
		}
	}

	private async isPanelChannel(guildId: string, textChannelId: string): Promise<boolean> {
		try {
			const pinned = await guildChannels.getPanelChannel(this.deps.guildService, guildId);
			return Boolean(pinned) && pinned === textChannelId;
		} catch {
			return false;
		}
	}
}
