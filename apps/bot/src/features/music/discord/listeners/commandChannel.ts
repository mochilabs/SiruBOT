import { ApplyOptions } from '@sapphire/decorators';
import { emoji } from '@sirubot/utils';
import { Events, Listener } from '@sapphire/framework';
import { ButtonInteraction, ChannelType, type ContainerBuilder, Message, MessageFlags, StringSelectMenuInteraction } from 'discord.js';
import { Player, Track, UnresolvedTrack } from 'lavalink-client';
import * as searchView from '../views/search.ts';
import { createComponentSession, type ComponentSession } from '../../../../lib/componentSession.ts';
import { errorView } from '../../../../lib/errorView.ts';
import { unexpectedErrorView } from '../../../../lib/unexpectedErrorView.ts';
import { AppError } from '../../../../lib/appError.ts';
import * as guildChannels from '../../../../services/guildSettings/channels.ts';
import { isMessageFeatureEnabled } from '../../../../services/guildSettings/modules.ts';
import { actorFromMember } from '../../application/actor.ts';
import { trackPlayFeedback } from '../utils/playFeedback.ts';
import { RESULT_LIMIT, SELECT_TIMEOUT_MS } from '../utils/searchSelect.ts';
import { usageFeatureKey } from '@sirubot/utils/modules';
import { inGuildTheme } from '../../../../lib/guildThemeScope.ts';

const MAX_QUERY_LENGTH = 100;
const COOLDOWN_MS = 2500;
const NOTICE_LIFETIME_MS = 5000;

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class CommandChannelListener extends Listener {
	private readonly cooldowns = new Map<string, number>();
	private readonly inFlight = new Set<string>();

	public override async run(message: Message): Promise<void> {
		try {
			await inGuildTheme(message.guildId, () => this.handle(message));
		} catch (error) {
			this.container.logger.error(`[commandChannel] unhandled error (guild ${message.guildId}): ${error}`);
			await message
				.reply({
					components: [await unexpectedErrorView(`${emoji('error')} 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.`)],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { repliedUser: false }
				})
				.catch(() => null);
		}
	}

	private async handle(message: Message): Promise<void> {
		if (!message.inGuild() || message.author.bot) return;
		if (message.channel.type !== ChannelType.GuildText) return;

		const content = message.content?.trim();
		if (!content) return;

		const guildId = message.guildId;
		if (!(await isMessageFeatureEnabled(this.container.guildService, guildId, 'music-channel'))) return;
		const pinned = await guildChannels.getDefaultTextChannel(this.container.guildService, guildId);
		if (!pinned || pinned !== message.channelId) return;
		if (!(await guildChannels.getTextChannelInputPlay(this.container.guildService, guildId))) return;
		const panelMode = (await guildChannels.getPanelChannel(this.container.guildService, guildId)) === message.channelId;

		if (content.length > MAX_QUERY_LENGTH) {
			await this.replyNotice(message, [errorView(`${emoji('error')} 검색어는 ${MAX_QUERY_LENGTH}자까지만 입력할 수 있어요.`)], panelMode);
			return;
		}

		if (this.container.audio.nodeManager.nodes.filter((node) => node.connected).size === 0) {
			await this.replyNotice(
				message,
				[await unexpectedErrorView(`${emoji('error')} 현재 사용 가능한 노드가 없어요. 잠시 후 다시 시도해 주세요.`)],
				panelMode
			);
			return;
		}

		const cooldownKey = `${guildId}:${message.author.id}`;
		const now = Date.now();
		const last = this.cooldowns.get(cooldownKey) ?? 0;
		if (now - last < COOLDOWN_MS) return;
		this.pruneCooldowns(now);
		this.cooldowns.set(cooldownKey, now);

		if (this.inFlight.has(guildId)) return;
		this.inFlight.add(guildId);

		try {
			const member = message.member;
			if (!member) return;
			const actor = actorFromMember(member);
			const input = {
				query: content,
				platform: 'ytsearch' as const,
				requester: { id: message.author.id, username: message.author.username },
				textChannelId: pinned,
				pinTextChannel: true
			};

			this.container.usageRecorder?.record(guildId, usageFeatureKey('msg', 'music-channel'), message.author.id);
			const mode = await guildChannels.getTextChannelMode(this.container.guildService, guildId);
			if (mode === 'select') {
				const found = await this.container.musicPlay.search(actor, input);
				await this.runSelect(message, found.player, content, found.tracks.slice(0, RESULT_LIMIT), panelMode);
			} else {
				const result = await this.container.musicPlay.play(actor, input, { kind: 'first' });
				await this.replyPlayed(message, result.player, result.queued[0]!, result.wasIdle, panelMode);
			}
		} catch (error) {
			if (error instanceof AppError) {
				await this.replyNotice(message, [errorView(error.userMessage)], panelMode);
				return;
			}
			throw error;
		} finally {
			this.inFlight.delete(guildId);
		}
	}

	private async replyNotice(message: Message, components: ContainerBuilder[], panelMode: boolean): Promise<void> {
		const reply = await message
			.reply({ components, flags: [MessageFlags.IsComponentsV2], allowedMentions: { repliedUser: false } })
			.catch(() => null);
		if (!panelMode) return;
		const timer = setTimeout(() => {
			void reply?.delete().catch(() => null);
			if (message.deletable) void message.delete().catch(() => null);
		}, NOTICE_LIFETIME_MS);
		timer.unref?.();
	}

	private async deleteInput(message: Message, panelMode: boolean): Promise<void> {
		if (!panelMode || !message.deletable) return;
		await message.delete().catch((error) => {
			this.container.logger.warn(`[commandChannel] failed to delete input message (guild ${message.guildId}): ${error}`);
		});
	}

	private async replyPlayed(message: Message, player: Player, track: Track | UnresolvedTrack, wasIdle: boolean, panelMode: boolean): Promise<void> {
		if (panelMode) {
			await this.deleteInput(message, true);
			return;
		}
		await message
			.reply({
				components: await trackPlayFeedback(player, track, message.author.id, wasIdle),
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { repliedUser: false, users: [], roles: [] }
			})
			.catch(() => null);
	}

	private async runSelect(message: Message, player: Player, query: string, tracks: (Track | UnresolvedTrack)[], panelMode: boolean): Promise<void> {
		const selectMessage = await message
			.reply({
				components: [searchView.searchResults(query, tracks)],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { repliedUser: false, users: [], roles: [] }
			})
			.catch(() => null);
		if (!selectMessage) return;

		const handleTimeout = async () => {
			if (panelMode) await selectMessage.delete().catch(() => null);
			else await selectMessage.edit({ components: [searchView.searchTimeout()], flags: [MessageFlags.IsComponentsV2] }).catch(() => null);
			await this.deleteInput(message, panelMode);
		};

		const handleCancel = async (collected: ButtonInteraction<'cached'>, session: ComponentSession) => {
			if (!session.settle('cancel')) return;
			if (panelMode) {
				await collected.deferUpdate().catch(() => null);
				await selectMessage.delete().catch(() => null);
			} else {
				await collected
					.update({
						components: [searchView.searchCancelled()],
						flags: [MessageFlags.IsComponentsV2],
						allowedMentions: { users: [], roles: [] }
					})
					.catch(() => null);
			}
			await this.deleteInput(message, panelMode);
		};

		const handleSelect = async (selectInteraction: StringSelectMenuInteraction<'cached'>, session: ComponentSession) => {
			if (session.settled) return;
			const index = Number.parseInt(selectInteraction.values[0], 10);
			const selected = tracks[index];
			if (!selected) {
				await selectInteraction
					.reply({
						components: [errorView(`${emoji('error')} 1~${tracks.length}번 중에서 골라 주세요.`)],
						flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
					})
					.catch(() => null);
				return;
			}

			await selectInteraction.deferUpdate();
			if (!session.settle('select')) return;

			try {
				const { wasIdle } = await this.container.musicPlay.enqueue(player, selected);
				await this.deleteInput(message, panelMode);
				if (panelMode) await selectMessage.delete().catch(() => null);
				else
					await selectInteraction
						.editReply({
							components: await trackPlayFeedback(player, selected, message.author.id, wasIdle),
							flags: [MessageFlags.IsComponentsV2],
							allowedMentions: { users: [], roles: [] }
						})
						.catch(() => null);
				await this.container.musicPlay.startPlayback(player);
			} catch (error) {
				this.container.logger.error(`[commandChannel] failed to play selected track (guild ${message.guildId}): ${error}`);
				await selectInteraction
					.editReply({
						components: [errorView(`${emoji('error')} 선택한 곡을 재생하지 못했어요. 다시 입력해 주세요.`)],
						flags: [MessageFlags.IsComponentsV2],
						allowedMentions: { users: [], roles: [] }
					})
					.catch(() => null);
			}
		};

		createComponentSession(selectMessage, {
			logger: this.container.logger,
			owner: {
				userId: message.author.id,
				accept: (i) => i.customId === searchView.searchSelectCustomId || i.customId === searchView.searchCancelCustomId
			},
			time: SELECT_TIMEOUT_MS,
			onCollect: (collected, session) => {
				if (collected.customId === searchView.searchCancelCustomId) {
					void handleCancel(collected as ButtonInteraction<'cached'>, session);
					return;
				}
				void handleSelect(collected as StringSelectMenuInteraction<'cached'>, session);
			},
			onTimeout: handleTimeout
		});
	}

	private pruneCooldowns(now: number): void {
		if (this.cooldowns.size < 1000) return;
		for (const [key, timestamp] of this.cooldowns) {
			if (now - timestamp > 10_000) this.cooldowns.delete(key);
		}
	}
}
