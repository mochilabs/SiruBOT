import { ApplyOptions } from '@sapphire/decorators';
import { emoji } from '@sirubot/utils';
import { Events, Listener, UserError } from '@sapphire/framework';
import { ChannelType, ComponentType, Message, MessageFlags, StringSelectMenuInteraction } from 'discord.js';
import { Player, Track, UnresolvedTrack } from 'lavalink-client';
import { getUserQueuedTracks } from '../lavalink/autoPlayRelated.ts';
import * as playView from '../view/play.ts';
import * as searchView from '../view/search.ts';
import { errorView } from '../view/error.ts';

/** 검색어로 취급할 최대 길이 — 일반 대화로 보이는 긴 메시지는 거절 안내를 보낸다. */
const MAX_QUERY_LENGTH = 100;
/** 같은 유저의 연속 입력 쿨다운(ms) — 도배 방지, 초과분은 조용히 무시한다. */
const COOLDOWN_MS = 2500;
/** 곡 선택 대기 시간(ms). */
const SELECT_TIMEOUT_MS = 30_000;

/**
 * 고정 채널 리스너 — 설정된 채널의 텍스트 메시지를 검색어로 받아 재생한다.
 * 권한 제한은 없다(사용자 결정): 음성 연결·노드·봇 위치만 확인한다.
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
					components: [errorView(`${emoji('tools')} 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.`)],
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
		const pinned = await this.container.guildService.getPinnedChannel(guildId);
		if (!pinned || pinned !== message.channelId) return;

		if (content.length > MAX_QUERY_LENGTH) {
			await message
				.reply({
					components: [errorView(`${emoji('scissors')} 검색어는 ${MAX_QUERY_LENGTH}자까지만 입력할 수 있어요.`)],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { repliedUser: false }
				})
				.catch(() => null);
			return;
		}

		// 권한 제한 없음 — 대신 음성 연결을 요구한다 (미연결 시 안내).
		const voiceChannelId = message.member?.voice?.channelId;
		if (!voiceChannelId) {
			await message
				.reply({
					components: [errorView(`${emoji('bulb')} 재생하려면 음성 채널에 접속한 상태에서 입력해 주세요.`)],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { repliedUser: false }
				})
				.catch(() => null);
			return;
		}

		if (this.container.audio.nodeManager.nodes.filter((node) => node.connected).size === 0) {
			await message
				.reply({
					components: [errorView(`${emoji('bulb')} 현재 사용 가능한 노드가 없어요. 잠시 후 다시 시도해 주세요.`)],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { repliedUser: false }
				})
				.catch(() => null);
			return;
		}

		const player = this.container.audio.getPlayer(guildId);
		if (player?.voiceChannelId && player.voiceChannelId !== voiceChannelId) {
			await message
				.reply({
					components: [
						errorView(
							`${emoji('headphone')} 다른 음성 채널(<#${player.voiceChannelId}>)에서 재생 중이에요. 같은 채널에 접속하거나 /stop 으로 멈춘 뒤 입력해 주세요.`
						)
					],
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
			const context = {
				command: 'commandChannel',
				query: content,
				platform: 'ytsearch',
				voiceChannelId,
				textChannelId: pinned,
				guildId
			};

			// 텍스트 채널은 고정 채널로 고정한다 — 컨트롤러도 거기서 갱신된다.
			const activePlayer = await this.container.audioService.getOrCreatePlayer(guildId, voiceChannelId, pinned);
			activePlayer.textChannelId = pinned;

			const searchRes = await this.container.audioService.search(
				activePlayer,
				content,
				'ytsearch',
				{ id: message.author.id, username: message.author.username },
				context
			);

			await this.container.audioService.connectPlayer(activePlayer, context);

			const tracks = searchRes.tracks.slice(0, 5);
			if (tracks.length === 0) {
				await this.resolveInputMessage(message, guildId);
				await message
					.reply({
						components: [errorView(`${emoji('magnet')} 검색 결과가 없어요. 다른 검색어로 다시 시도해 주세요.`)],
						flags: [MessageFlags.IsComponentsV2],
						allowedMentions: { repliedUser: false }
					})
					.catch(() => null);
				return;
			}

			const mode = await this.container.guildService.getPinnedChannelMode(guildId);
			if (mode === 'select') {
				await this.runSelect(message, activePlayer, content, tracks);
			} else {
				await this.playImmediate(message, activePlayer, tracks[0]);
			}
		} catch (error) {
			if (error instanceof UserError) {
				await message
					.reply({
						components: [errorView(error.message)],
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
			if (!(await this.container.guildService.getPinnedChannelDeleteInput(guildId))) return;
			if (message.deletable) await message.delete().catch(() => null);
		} catch (error) {
			this.container.logger.warn(`[commandChannel] failed to delete input message (guild ${guildId}): ${error}`);
		}
	}

	/** play 모드 — 첫 결과를 바로 대기열에 넣고 피드백을 답장한다. */
	private async playImmediate(message: Message, player: Player, track: Track | UnresolvedTrack): Promise<void> {
		const { wasIdle } = await this.container.audioService.enqueueTrack(player, track);
		await this.resolveInputMessage(message, player.guildId);
		await message
			.reply({
				components: await this.buildFeedback(player, track, message.author.id, wasIdle),
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { repliedUser: false, users: [], roles: [] }
			})
			.catch(() => null);
		await this.container.audioService.ensurePlayback(player);
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

		const collector = selectMessage.createMessageComponentCollector({
			filter: (i) => i.user.id === message.author.id && i.customId === searchView.searchSelectCustomId,
			componentType: ComponentType.StringSelect,
			time: SELECT_TIMEOUT_MS
		});

		const handleTimeout = async () => {
			await selectMessage.edit({ components: [searchView.searchTimeout()], flags: [MessageFlags.IsComponentsV2] }).catch(() => null);
			await this.resolveInputMessage(message, player.guildId);
		};

		const handleSelect = async (selectInteraction: StringSelectMenuInteraction<'cached'>) => {
			await selectInteraction.deferUpdate();
			collector.off('collect', handleSelect);
			collector.off('end', handleTimeout);

			const index = Number.parseInt(selectInteraction.values[0], 10);
			const selected = tracks[index];
			if (!selected) {
				await handleTimeout();
				return;
			}

			try {
				const { wasIdle } = await this.container.audioService.enqueueTrack(player, selected);
				await this.resolveInputMessage(message, player.guildId);
				await selectInteraction
					.editReply({
						components: await this.buildFeedback(player, selected, message.author.id, wasIdle),
						flags: [MessageFlags.IsComponentsV2],
						allowedMentions: { users: [], roles: [] }
					})
					.catch(() => null);
				await this.container.audioService.ensurePlayback(player);
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

		collector.once('collect', handleSelect);
		collector.once('end', handleTimeout);
	}

	/** 재생 피드백 컨테이너 — handleTrackPlay와 동일한 분기(시작/추가)를 사용한다. */
	private async buildFeedback(player: Player, track: Track | UnresolvedTrack, userId: string, wasIdle: boolean) {
		if (wasIdle && (await this.container.audioService.isControllerEnabled(player.guildId))) {
			return [playView.playStarted({ track: track as Track, userId })];
		}
		return [
			playView.trackAdded({
				track: track as Track,
				queued: player.queue.current !== null,
				position: getUserQueuedTracks(player).length,
				totalDuration: getUserQueuedTracks(player).reduce((acc, t) => acc + (t.info.duration ?? 0), 0)
			})
		];
	}

	/** 쿨다운 맵이 커지는 것을 막는다 — 10초 지난 항목은 버린다. */
	private pruneCooldowns(now: number): void {
		if (this.cooldowns.size < 1000) return;
		for (const [key, timestamp] of this.cooldowns) {
			if (now - timestamp > 10_000) this.cooldowns.delete(key);
		}
	}
}
