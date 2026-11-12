import { emoji, resolveYouTubeVideoId, type SponsorBlockSkipSegment } from '@sirubot/utils';
import { MessageFlags, type Client } from 'discord.js';
import { notice } from '../modules/general/view/notice.ts';
import type { Track } from 'lavalink-client';
import type { CustomPlayer } from '../features/music/lavalink/player/customPlayer.ts';
import { getTargetNextTrack, notifyQueueMutated } from '../features/music/lavalink/queue/queueWrapper.ts';
import { fetchSponsorBlockSegments } from './dataApiClient.ts';
import * as guildMixer from './guildSettings/mixer.ts';
import type { AppLogger } from '../lib/appLogger.ts';
import type { GuildService } from './guildService.ts';
import type { MixerService } from './mixerService.ts';

const LOOKUP_TTL_MS = 10 * 60_000;
const INTRO_TOLERANCE_MS = 500;
const MAX_LOCAL_ENTRIES = 256;

interface PlaybackState {
	track: Track;
	segments: SponsorBlockSkipSegment[];
	categories: Set<string>;
	timer: NodeJS.Timeout | null;
	busy: boolean;
	lastSkipEnd: number;
	crossfadeMs: number;
	outroArmTimer: NodeJS.Timeout | null;
	lastOutroArmKey: string | null;
}

export interface SponsorBlockServiceDeps {
	logger: AppLogger;
	guildService: GuildService;
	/** client는 로그인 뒤에 준비돼서 호출 시점에 읽어요 */
	getClient: () => Client;
	/** mixerService와 서로 얽혀 있어서 호출 시점에 읽어요 */
	getMixerService: () => MixerService;
}

/** Segment lookup, live skipping, and incoming mixer start all use the same source. */
export class SponsorBlockService {
	private readonly lookups = new Map<string, { expiresAt: number; promise: Promise<SponsorBlockSkipSegment[]> }>();
	private readonly playback = new WeakMap<CustomPlayer, PlaybackState>();

	public constructor(private readonly deps: SponsorBlockServiceDeps) {}

	private notifySkip(player: CustomPlayer, category: string): void {
		if (!player.textChannelId) return;
		const channel = this.deps.getClient().channels.cache.get(player.textChannelId);
		if (!channel?.isSendable()) return;
		const names: Record<string, string> = {
			sponsor: '프로모션',
			selfpromo: '자사 홍보',
			interaction: '상호 작용 요청',
			intro: '인트로',
			outro: '아웃트로',
			preview: '미리보기',
			music_offtopic: '음악이 아닌',
			filler: '빈'
		};
		void channel
			.send({
				components: [notice(`${emoji('arrow_forward')} [SponsorBlock] **${names[category] ?? category}** 구간을 건너뛰었어요.`)],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications]
			})
			.then((message) => setTimeout(() => void message.delete().catch(() => null), 3_000))
			.catch(() => null);
	}

	private lookup(videoId: string): Promise<SponsorBlockSkipSegment[]> {
		const cached = this.lookups.get(videoId);
		if (cached && cached.expiresAt > Date.now()) return cached.promise;
		const promise = fetchSponsorBlockSegments(videoId).catch((error: unknown) => {
			this.lookups.delete(videoId);
			throw error;
		});
		this.lookups.set(videoId, { expiresAt: Date.now() + LOOKUP_TTL_MS, promise });
		if (this.lookups.size > MAX_LOCAL_ENTRIES) this.lookups.delete(this.lookups.keys().next().value!);
		return promise;
	}

	public prefetch(track: Track | null): void {
		const videoId = resolveYouTubeVideoId(track);
		if (videoId) void this.lookup(videoId).catch(() => null);
	}

	public async incomingStartPositionMs(player: CustomPlayer, track: Track): Promise<number | undefined> {
		const videoId = resolveYouTubeVideoId(track);
		if (!videoId || track.info.isStream || !track.info.isSeekable) return undefined;
		const [guild, segments] = await Promise.all([this.deps.guildService.getGuild(player.guildId), this.lookup(videoId)]);
		const categories = new Set<string>(guild.sponsorBlockSegments);
		if (!categories.size) return undefined;
		let end = 0;
		for (const segment of segments.filter((s) => categories.has(s.category)).sort((a, b) => a.startMs - b.startMs)) {
			if (segment.startMs > end + INTRO_TOLERANCE_MS) break;
			end = Math.max(end, segment.endMs);
		}
		const duration = track.info.duration ?? 0;
		return end > 0 && end < duration - 500 ? end : undefined;
	}

	public outgoingEndPositionMs(player: CustomPlayer): number | undefined {
		const state = this.playback.get(player);
		if (!state || player.queue.current?.encoded !== state.track.encoded || !state.categories.has('outro')) return undefined;
		const duration = state.track.info.duration ?? 0;
		const outro = state.segments
			.filter((s) => s.category === 'outro' && s.endMs >= duration - 2_000 && s.startMs > 500 && s.startMs < duration - 500)
			.sort((a, b) => a.startMs - b.startMs)[0];
		if (!outro || outro.startMs <= (player.position ?? 0) + Math.max(500, state.crossfadeMs + 500)) return undefined;
		return outro.startMs;
	}

	public startTrack(player: CustomPlayer, track: Track | null): void {
		this.stop(player);
		const videoId = resolveYouTubeVideoId(track);
		if (!track || !videoId || track.info.isStream || !track.info.isSeekable) return;
		const state: PlaybackState = {
			track,
			segments: [],
			categories: new Set(),
			timer: null,
			busy: false,
			lastSkipEnd: -1,
			crossfadeMs: 0,
			outroArmTimer: null,
			lastOutroArmKey: null
		};
		this.playback.set(player, state);
		void Promise.all([
			this.deps.guildService.getGuild(player.guildId),
			this.lookup(videoId),
			guildMixer.getMixerSettings(this.deps.guildService, player.guildId).catch(() => null)
		])
			.then(([guild, segments, mixer]) => {
				if (this.playback.get(player) !== state) return;
				state.categories = new Set(guild.sponsorBlockSegments);
				state.segments = segments;
				state.crossfadeMs = mixer?.crossfadeEnabled ? mixer.crossfadeMs : 0;
				this.tick(player);
				this.queueChanged(player);
			})
			.catch((error: unknown) => this.deps.logger.debug(`[SponsorBlock] lookup failed for ${videoId}: ${String(error)}`));
	}

	public refreshSettings(player: CustomPlayer): void {
		const state = this.playback.get(player);
		if (!state) return;
		void this.deps.guildService
			.getGuild(player.guildId)
			.then((guild) => {
				if (this.playback.get(player) !== state) return;
				const hadOutroArm = state.lastOutroArmKey !== null;
				state.categories = new Set(guild.sponsorBlockSegments);
				this.tick(player);
				if (hadOutroArm && !state.categories.has('outro')) {
					state.lastOutroArmKey = null;
					notifyQueueMutated(player, { force: true });
				} else {
					this.queueChanged(player);
				}
			})
			.catch(() => null);
	}

	public stop(player: CustomPlayer): void {
		const state = this.playback.get(player);
		if (state?.timer) clearTimeout(state.timer);
		if (state?.outroArmTimer) clearTimeout(state.outroArmTimer);
		this.playback.delete(player);
	}

	public queueChanged(player: CustomPlayer): void {
		const state = this.playback.get(player);
		if (!state) return;
		if (state.outroArmTimer) clearTimeout(state.outroArmTimer);
		state.outroArmTimer = null;
		const target = getTargetNextTrack(player);
		const currentEncoded = state.track.encoded;
		const end = target && this.outgoingEndPositionMs(player);
		if (!target?.encoded || !currentEncoded || !end || this.deps.getMixerService().isOverlapActive(player.guildId)) return;
		const key = `${player.currentEpoch}:${target.encoded}:${end}`;
		if (key === state.lastOutroArmKey) return;
		state.outroArmTimer = setTimeout(() => {
			state.outroArmTimer = null;
			if (
				this.playback.get(player) !== state ||
				getTargetNextTrack(player)?.encoded !== target.encoded ||
				this.outgoingEndPositionMs(player) !== end
			)
				return;
			state.lastOutroArmKey = key;
			void import('../features/music/lavalink/handlers/mixerHandlers.ts')
				.then(({ handleMixerNeedNext }) =>
					handleMixerNeedNext(player, {
						remainingMs: (state.track.info.duration ?? 0) - (player.position ?? 0),
						currentTrackEncoded: currentEncoded
					})
				)
				.catch((error: unknown) => this.deps.logger.warn(`[SponsorBlock] early outro arm failed in ${player.guildId}: ${String(error)}`));
		}, 75);
	}

	public tick(player: CustomPlayer): void {
		const state = this.playback.get(player);
		if (!state) return;
		if (state.timer) clearTimeout(state.timer);
		state.timer = null;
		if (!player.playing || player.paused || player.queue.current?.encoded !== state.track.encoded || state.busy) return;
		const position = player.position ?? 0;
		const duration = state.track.info.duration ?? 0;
		const boundary = duration - state.crossfadeMs;
		const segment = state.segments
			.filter((s) => state.categories.has(s.category) && s.endMs > position && s.endMs > state.lastSkipEnd)
			.sort((a, b) => a.startMs - b.startMs)[0];
		if (!segment) return;
		if (segment.startMs <= position + 150) {
			if (
				this.deps.getMixerService().isOverlapActive(player.guildId) ||
				(state.crossfadeMs > 0 && getTargetNextTrack(player) && segment.endMs > boundary)
			)
				return;
			state.busy = true;
			state.lastSkipEnd = segment.endMs;
			void player
				.seek(segment.endMs)
				.then(() => {
					if (this.playback.get(player) === state) {
						this.deps.logger.info(`[SponsorBlock] skipped ${segment.category} in ${player.guildId}`);
						this.notifySkip(player, segment.category);
					}
				})
				.catch((error: unknown) => {
					state.lastSkipEnd = -1;
					this.deps.logger.warn(`[SponsorBlock] seek failed in ${player.guildId}: ${String(error)}`);
				})
				.finally(() => {
					state.busy = false;
					if (this.playback.get(player) === state) this.tick(player);
				});
			return;
		}
		state.timer = setTimeout(() => this.tick(player), Math.min(30_000, Math.max(100, segment.startMs - position)));
	}
}
