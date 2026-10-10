import { container, UserError } from '@sapphire/framework';
import { SapphireInterfaceLogger } from '../../../../core/logger.ts';
import { ILogObj, Logger } from 'tslog';
import { ChatInputCommandInteraction, MessageFlags, type Message } from 'discord.js';

import * as view from '../../view/controller.ts';
import { CustomPlayer } from './customPlayer.ts';
import { clearNowPlayingCard, getCachedNowPlayingCard, getNowPlayingCardKey, resolveNowPlayingCard } from './nowPlayingCard.ts';
import { Guild } from '@sirubot/prisma';

type ControllerOptions = Pick<Guild, 'enableController' | 'volume'>;

export class PlayerNotifier {
	private logger: Logger<ILogObj>;
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
	/** 전송/수정은 길드별로 직렬화하고, 이미지 렌더는 이 체인 밖에서 수행한다. */
	private readonly sendChains: Map<string, Promise<void>> = new Map();
	private readonly cardRefreshes = new Map<string, { messageId: string; trackKey: string }>();
	private readonly renderedSignatures = new WeakMap<Message, string>();
	private readonly controllerVersions = new WeakMap<CustomPlayer, number>();
	private readonly destroyedPlayers = new WeakSet<CustomPlayer>();

	private readonly DEBOUNCE_MS = Number(process.env.NOTIFIER_DEBOUNCE_MS) || 300;

	constructor() {
		this.logger = (container.logger as SapphireInterfaceLogger).getSubLogger({ name: 'playerNotifier' });
	}

	private get container() {
		return container;
	}

	// Force send controller message
	public sendController(player: CustomPlayer, interaction?: ChatInputCommandInteraction): Promise<void> {
		const version = this.controllerVersions.get(player) ?? 0;
		return this.enqueueControllerOperation(player.guildId, () => this.sendControllerNow(player, interaction, version));
	}

	private enqueueControllerOperation(guildId: string, operation: () => Promise<void>): Promise<void> {
		const previous = this.sendChains.get(guildId) ?? Promise.resolve();
		const run = previous.catch(() => undefined).then(operation);
		const completed = run.then(
			() => undefined,
			() => undefined
		);
		this.sendChains.set(guildId, completed);
		void completed.finally(() => {
			if (this.sendChains.get(guildId) === completed) this.sendChains.delete(guildId);
		});
		return run;
	}

	private canSend(player: CustomPlayer, version: number, interaction?: ChatInputCommandInteraction): boolean {
		if (!this.destroyedPlayers.has(player) && (this.controllerVersions.get(player) ?? 0) === version) return true;
		if (interaction) {
			throw new UserError({
				identifier: 'nowplaying_state_changed',
				message: '🎵 재생 상태가 바뀌었어요. `/현재곡`으로 다시 확인해 주세요.',
				context: { ephemeral: true }
			});
		}
		return false;
	}

	private async sendControllerNow(
		player: CustomPlayer,
		interaction?: ChatInputCommandInteraction,
		version = this.controllerVersions.get(player) ?? 0
	): Promise<void> {
		this.logger.debug(`Sending new controller for guild: ${player.guildId}`);

		try {
			if (!this.canSend(player, version, interaction)) return;
			this.clearDebounceTimer(player.guildId);
			// when interaction is noen and player has not textChannelId, throw error
			if (!interaction && !player.textChannelId) throw new Error(`Player has not textChannelId ${player.guildId}`);
			const options = await this.getControllerOptions(player.guildId);

			// Check if options null and guild not using audio controller, and this method called automatically, ignore it
			if (!options) {
				if (interaction) throw new Error(`Controller settings unavailable for guild ${player.guildId}`);
				return;
			}
			if (!options.enableController && !interaction) return;
			if (!this.canSend(player, version, interaction)) return;

			// Delete existing controller message (only when a new one will actually be sent)
			await this.removeController(player);
			if (!this.canSend(player, version, interaction)) return;

			// 준비된 카드만 사용해 기본 화면을 먼저 보내고, 미완성 카드는 나중에 붙인다.
			const card = getCachedNowPlayingCard(player);
			const components = view.controllerView({
				player,
				volume: options.volume,
				nowPlayingCardUrl: card?.url
			});
			const files = card ? [card.file] : [];

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
				const textChannel = this.container.client.channels.cache.get(player.textChannelId);
				if (!textChannel?.isSendable()) return;
				message = await textChannel.send({
					components: [components],
					files,
					flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
					allowedMentions: { roles: [], users: [] }
				});
			}

			if (this.destroyedPlayers.has(player) || (this.controllerVersions.get(player) ?? 0) !== version) {
				await (interaction ? interaction.deleteReply() : message.delete()).catch(() => null);
				this.canSend(player, version, interaction);
				return;
			}
			player.messageId = message.id;
			player.controller = message;
			this.renderedSignatures.set(message, JSON.stringify(components.toJSON()));
			if (!card) this.startCardRefresh(player, message.id, Boolean(interaction));
			this.logger.debug(`Created new controller message for guild: ${player.guildId}`);
		} catch (error) {
			this.logger.error(`Failed to send new controller for guild ${player.guildId}:`, error);
			if (interaction) {
				if (interaction.deferred) await interaction.deleteReply().catch(() => null);
				throw error;
			}
		}
	}

	// Update controller message (debounce)
	public updateController(player: CustomPlayer): void {
		this.clearDebounceTimer(player.guildId);

		const timer = setTimeout(() => {
			this.debounceTimers.delete(player.guildId);
			void this.enqueueControllerOperation(player.guildId, () => this.updateControllerNow(player)).catch((error) => {
				this.logger.error(`Failed to update controller for guild ${player.guildId}:`, error);
			});
		}, this.DEBOUNCE_MS);

		this.debounceTimers.set(player.guildId, timer);
	}

	private async updateControllerNow(player: CustomPlayer, allowDisabled = false): Promise<void> {
		const message = player.controller;
		const version = this.controllerVersions.get(player) ?? 0;
		if (!message || player.messageId !== message.id || !this.canSend(player, version)) return;
		try {
			const options = await this.getControllerOptions(player.guildId);
			if (!options || (!options.enableController && !allowDisabled)) return;
			if (!this.canSend(player, version) || player.messageId !== message.id || player.controller?.id !== message.id) return;
			const card = getCachedNowPlayingCard(player);
			const components = view.controllerView({ player, volume: options.volume, nowPlayingCardUrl: card?.url });
			// files: []도 attachments: []로 변환되므로 유지할 카드 ID를 명시한다.
			const attachments = card ? message.attachments.filter((file) => file.name === card.filename).map((file) => ({ id: file.id })) : [];
			const files = card && !message.attachments.some((file) => file.name === card.filename) ? [card.file] : [];
			const signature = JSON.stringify(components.toJSON());
			if (files.length === 0 && this.renderedSignatures.get(message) === signature) {
				if (!card) this.startCardRefresh(player, message.id, allowDisabled);
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
				if (!card) this.startCardRefresh(player, message.id, allowDisabled);
				this.logger.trace(`Updated controller message for guild: ${player.guildId}`);
			}
		} catch (error: any) {
			if (error.code !== 10008) throw error;
			if (!this.canSend(player, version) || player.messageId !== message.id) return;
			this.logger.debug(`Unknown message error ignored while updating controller for guild ${player.guildId}`);
			if (
				player.textChannelId &&
				(await this.isPinnedChannel(player.guildId, player.textChannelId)) &&
				this.canSend(player, version) &&
				player.messageId === message.id
			) {
				player.messageId = null;
				player.controller = null;
				// 이미 직렬화 체인 안에 있으므로 다시 enqueue하지 않는다.
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
		void resolveNowPlayingCard(player)
			.then((card) => {
				if (!card) return;
				return this.enqueueControllerOperation(player.guildId, async () => {
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

	// Clear debounce timer
	private clearDebounceTimer(guildId: string): void {
		const timer = this.debounceTimers.get(guildId);
		if (timer) {
			clearTimeout(timer);
			this.debounceTimers.delete(guildId);
		}
	}

	// Delete controller message
	public async deleteController(player: CustomPlayer): Promise<void> {
		this.controllerVersions.set(player, (this.controllerVersions.get(player) ?? 0) + 1);
		await this.removeController(player);
	}

	private async removeController(player: CustomPlayer): Promise<void> {
		this.clearDebounceTimer(player.guildId);
		this.cardRefreshes.delete(player.guildId);

		const controllerMessage = player.controller;
		const messageId = player.messageId;

		// 봇이 직접 삭제할 때, messageDeleted 이벤트가 발생했을 때 구별하기 위해 미리 null로 비워둡니다.
		player.messageId = null;
		player.controller = null;

		// controller 객체가 이미 있으면 fetch 없이 바로 삭제
		if (controllerMessage?.deletable) {
			await controllerMessage.delete().catch((error: any) => {
				if (error.code !== 10008) {
					this.logger.warn(`Failed to delete controller message for guild ${player.guildId}: ${error.message}`);
				}
			});
			return;
		}

		// controller 객체가 없지만 messageId가 남아있는 경우 (resume 등) fallback fetch
		if (messageId && player.textChannelId) {
			const channel = this.container.client.channels.cache.get(player.textChannelId);
			if (channel?.isSendable()) {
				const message = await channel.messages.fetch(messageId).catch(() => null);
				if (message?.deletable) {
					await message.delete().catch((error: any) => {
						if (error.code !== 10008) {
							this.logger.warn(`Failed to delete controller message for guild ${player.guildId}: ${error.message}`);
						}
					});
				}
			}
		}
	}

	// Event handlers
	public async onTrackStart(player: CustomPlayer): Promise<void> {
		this.logger.debug(`Track started in guild: ${player.guildId}`);

		if (player.textChannelId && player.messageId) {
			// 고정 채널 모드: 채팅에 밀려도 항상 같은 메시지를 edit로 유지한다.
			if (await this.isPinnedChannel(player.guildId, player.textChannelId)) {
				this.updateController(player);
				return;
			}
			const channel = this.container.client.channels.cache.get(player.textChannelId);
			if (channel?.isSendable()) {
				// 만약 컨트롤러가 이미 마지막 메시지라면 굳이 다시 보낼 필요 없이 업데이트만 진행
				if (channel.lastMessageId === player.messageId) {
					this.updateController(player);
					return;
				}
			}
		}

		await this.sendController(player);
	}

	public onPlayerUpdate(player: CustomPlayer): void {
		this.logger.trace(`Player updated in guild: ${player.guildId}`);

		// Ignore when nothing is playing (e.g. track loading / idle)
		if (!player.queue.current) {
			// 재생 중인데 current가 비어 있으면 전이 리커널(trackHandler)이 복원할 때까지 기다린다.
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
		clearNowPlayingCard(player.guildId);
		await this.deleteController(player);
	}

	private async getControllerOptions(guildId: string): Promise<ControllerOptions | null> {
		try {
			const data = await this.container.guildService.getGuild(guildId);

			return data;
		} catch (error) {
			this.logger.error(`Failed to get controller options for guild ${guildId}:`, error);
			return null;
		}
	}

	/** 컨트롤러가 떠 있는 채널이 길드의 고정 채널인지 — 맞으면 핀 모드(edit 유지)로 다룬다. */
	private async isPinnedChannel(guildId: string, textChannelId: string): Promise<boolean> {
		try {
			const pinned = await this.container.guildService.getPinnedChannel(guildId);
			return Boolean(pinned) && pinned === textChannelId;
		} catch {
			return false;
		}
	}
}
