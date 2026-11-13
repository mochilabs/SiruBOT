import { ApplyOptions } from '@sapphire/decorators';
import { emoji } from '@sirubot/utils';
import { Events, Listener } from '@sapphire/framework';
import { ButtonInteraction, ChannelType, Message, MessageFlags, StringSelectMenuInteraction } from 'discord.js';
import { Player, Track, UnresolvedTrack } from 'lavalink-client';
import * as searchView from '../views/search.ts';
import { createComponentSession, type ComponentSession } from '../../../../lib/componentSession.ts';
import { errorView } from '../../../../lib/errorView.ts';
import { AppError } from '../../../../lib/appError.ts';
import * as guildChannels from '../../../../services/guildSettings/channels.ts';
import { actorFromMember } from '../../application/actor.ts';
import { trackPlayFeedback } from '../utils/playFeedback.ts';

/** 검색어로 취급할 최대 길이 — 일반 대화로 보이는 긴 메시지는 거절 안내를 보낸다. */
const MAX_QUERY_LENGTH = 100;
/** 같은 유저의 연속 입력 쿨다운(ms) — 도배 방지, 초과분은 조용히 무시한다. */
const COOLDOWN_MS = 2500;
/** 곡 선택 대기 시간(ms). */
const SELECT_TIMEOUT_MS = 30_000;
/** 선택 모드에서 보여줄 최대 결과 수 */
const RESULT_LIMIT = 5;

/**
 * 고정 채널 리스너 — 설정된 채널의 텍스트 메시지를 검색어로 받아 재생한다.
 * 음성 채널 정책(봇과 같은 채널, 원격 권한자 예외)은 음악 유스케이스가 판정하고, 여기서는 노드·도배 방지와 응답 화면만 맡는다.
 */
@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class CommandChannelListener extends Listener {
	private readonly cooldowns = new Map<string, number>();
	private readonly inFlight = new Set<string>();

	public override async run(message: Message): Promise<void> {
		try {
			await this.handle(message);
		} catch (error) {
			this.container.logger.error(`[commandChannel] unhandled error (guild ${message.guildId}): ${error}`);
			await message
				.reply({
					components: [errorView(`${emoji('error')} 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.`)],
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
		const pinned = await guildChannels.getPinnedChannel(this.container.guildService, guildId);
		if (!pinned || pinned !== message.channelId) return;

		if (content.length > MAX_QUERY_LENGTH) {
			await message
				.reply({
					components: [errorView(`${emoji('error')} 검색어는 ${MAX_QUERY_LENGTH}자까지만 입력할 수 있어요.`)],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { repliedUser: false }
				})
				.catch(() => null);
			return;
		}

		if (this.container.audio.nodeManager.nodes.filter((node) => node.connected).size === 0) {
			await message
				.reply({
					components: [errorView(`${emoji('error')} 현재 사용 가능한 노드가 없어요. 잠시 후 다시 시도해 주세요.`)],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { repliedUser: false }
				})
				.catch(() => null);
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
				// 텍스트 채널은 고정 채널로 고정한다 — 컨트롤러도 거기서 갱신된다.
				textChannelId: pinned,
				pinTextChannel: true
			};

			const mode = await guildChannels.getPinnedChannelMode(this.container.guildService, guildId);
			if (mode === 'select') {
				const found = await this.container.musicPlay.search(actor, input);
				await this.runSelect(message, found.player, content, found.tracks.slice(0, RESULT_LIMIT));
			} else {
				const result = await this.container.musicPlay.play(actor, input, { kind: 'first' });
				await this.replyPlayed(message, result.player, result.queued[0]!, result.wasIdle);
			}
		} catch (error) {
			if (error instanceof AppError) {
				await message
					.reply({
						components: [errorView(error.userMessage)],
						flags: [MessageFlags.IsComponentsV2],
						allowedMentions: { repliedUser: false }
					})
					.catch(() => null);
				return;
			}
			throw error;
		} finally {
			this.inFlight.delete(guildId);
		}
	}

	/** 고정 채널 입력 메시지 삭제 설정 — 켜져 있으면 봇이 처리를 마친 뒤 입력 메시지를 지운다 (Manage Messages 권한 필요). */
	private async resolveInputMessage(message: Message, guildId: string): Promise<void> {
		try {
			if (!(await guildChannels.getPinnedChannelDeleteInput(this.container.guildService, guildId))) return;
			if (message.deletable) await message.delete().catch(() => null);
		} catch (error) {
			this.container.logger.warn(`[commandChannel] failed to delete input message (guild ${guildId}): ${error}`);
		}
	}

	/** play 모드 — 유스케이스가 넣고 재생을 시작한 첫 결과의 피드백을 답장한다. */
	private async replyPlayed(message: Message, player: Player, track: Track | UnresolvedTrack, wasIdle: boolean): Promise<void> {
		await this.resolveInputMessage(message, player.guildId);
		await message
			.reply({
				components: await trackPlayFeedback(player, track, message.author.id, wasIdle),
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { repliedUser: false, users: [], roles: [] }
			})
			.catch(() => null);
	}

	/** select 모드 — 5개 선택 뷰를 올리고 30초간 선택을 기다린다. */
	private async runSelect(message: Message, player: Player, query: string, tracks: (Track | UnresolvedTrack)[]): Promise<void> {
		// 선택 모드는 입력 메시지 위에 선택 UI를 reply로 다는 형태라, 원본 삭제는 선택 확정/만료 시점에 한다.
		const selectMessage = await message
			.reply({
				components: [searchView.searchResults(query, tracks)],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { repliedUser: false, users: [], roles: [] }
			})
			.catch(() => null);
		if (!selectMessage) return;

		const handleTimeout = async () => {
			await selectMessage.edit({ components: [searchView.searchTimeout()], flags: [MessageFlags.IsComponentsV2] }).catch(() => null);
			await this.resolveInputMessage(message, player.guildId);
		};

		const handleCancel = async (collected: ButtonInteraction<'cached'>, session: ComponentSession) => {
			if (!session.settle('cancel')) return;
			await collected
				.update({
					components: [searchView.searchCancelled()],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { users: [], roles: [] }
				})
				.catch(() => null);
			await this.resolveInputMessage(message, player.guildId);
		};

		const handleSelect = async (selectInteraction: StringSelectMenuInteraction<'cached'>, session: ComponentSession) => {
			if (session.settled) return;
			const index = Number.parseInt(selectInteraction.values[0], 10);
			const selected = tracks[index];
			// 범위 밖 번호는 임시 안내만 보내고 선택 대기는 유지해요 (settle하지 않아요).
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
				await this.resolveInputMessage(message, player.guildId);
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

	/** 쿨다운 맵이 커지는 것을 막는다 — 10초 지난 항목은 버린다. */
	private pruneCooldowns(now: number): void {
		if (this.cooldowns.size < 1000) return;
		for (const [key, timestamp] of this.cooldowns) {
			if (now - timestamp > 10_000) this.cooldowns.delete(key);
		}
	}
}
