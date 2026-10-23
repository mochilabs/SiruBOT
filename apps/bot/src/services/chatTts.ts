import { container } from '@sapphire/framework';
import type { Message } from 'discord.js';
import type { Track, UnresolvedTrack } from 'lavalink-client';
import { isTtsClip, TTS_CLIP_REQUESTER_ID } from '../modules/audio/lavalink/requester.ts';
import type { CustomPlayer } from '../modules/audio/lavalink/player/customPlayer.ts';
import { TtsClip, TtsError, getTtsConfig } from './ttsService.ts';
import type { TtsUserPreset } from './ttsUserSettings.ts';

/**
 * 채팅 TTS 오케스트레이터 — 메시지 전처리·병합·스로틀 후 클립을 재생 모드(오버레이/단독)로 dispatch한다.
 *
 * 모드는 dispatch 시점에 재판정한다 (명세 4.2): 메인 트랙이 있으면 mixer announce 오버레이,
 * 없으면 클립을 메인 플레이어 트랙으로 재생하는 단독 모드. 만들어진 클립은 버리지 않고
 * 시점에 따라 둘 중 하나로 재생한다.
 */

/** 같은 유저의 연속 합성 간격(ms) — 이 안의 메시지는 병합 창으로 모인다 (명세 4.4) */
const TTS_USER_INTERVAL_MS = 3000;
/** 메시지 병합 창(ms) — 창 안의 메시지는 한 발화로 합성하고, 창을 넘긴 메시지는 버린다 */
export const TTS_MERGE_WINDOW_MS = 3000;
/** 클립 최대 길이(자) — 초과분은 절단한다 (명세 4.4, 분할 없음) */
export const TTS_CLIP_MAX_CHARS = 300;
/** 단독 모드 내부 큐 상한 — 초과 시 가장 오래된 대기 클립을 버린다 (재생 중인 클립은 보호) */
export const TTS_SOLO_QUEUE_MAX = 5;
/** 오버레이 대기(mixer announcementsQueued) 상한 — 초과 시 신규 안내를 조용히 거절한다 */
export const TTS_OVERLAY_QUEUE_MAX = 5;
/** 길드당 동시 합성 수 — 초과분은 FIFO로 대기한다 */
export const TTS_GUILD_CONCURRENT_SYNTH = 2;
/** 길드 분당 합성 글자 수 — 초과 시 클립을 버린다 */
export const TTS_GUILD_CHARS_PER_MIN = 1000;
/** 오버레이 ducking 수준 (명세 4.2) */
export const TTS_DUCK_LEVEL = 0.2;

export interface TtsTextResolvers {
	memberName(id: string): string | null;
	roleName(id: string): string | null;
	channelName(id: string): string | null;
}

/**
 * 메시지 본문을 낭독용 평문으로 바꾼다 (명세 4.5 전처리 표).
 * 멘션·역할·채널·커스텀 이모지·URL은 읽을 말로 치환하고, 코드/인용/스포일러는
 * 마커만 제거한 뒤 내용을 읽는다. 첨부/스티커만 있는 메시지는 빈 결과가 된다.
 */
export function preprocessTtsText(raw: string, resolvers: TtsTextResolvers): string {
	let text = raw ?? '';
	// 스포일러·코드·인용 마커 제거 — 내용은 읽는다
	text = text.replace(/\|\|([\s\S]*?)\|\|/g, '$1');
	text = text.replace(/```(?:\w*\n)?([\s\S]*?)```/g, '$1');
	text = text.replace(/`([^`\n]+)`/g, '$1');
	text = text.replace(/(^|\n)>{1,3}[ \t]*/g, '$1');
	// 멘션·역할·채널 토큰 → 사람이 읽을 말 (캐시 미스 시 대체어)
	text = text.replace(/<@!?(\d+)>/g, (_match, id: string) => resolvers.memberName(id) ?? '사용자');
	text = text.replace(/<@&(\d+)>/g, (_match, id: string) => resolvers.roleName(id) ?? '역할');
	text = text.replace(/<#(\d+)>/g, (_match, id: string) => resolvers.channelName(id) ?? '채널');
	// 커스텀 이모지 → 이름, 유니코드 이모지는 그대로 둔다
	text = text.replace(/<a?:([\w~]+):\d+>/g, '$1');
	text = text.replace(/@(everyone|here)\b/g, '모두');
	// URL은 읽지 않고 '링크'로 치환한다
	text = text.replace(/\b(?:https?:\/\/|www\.)[^\s<]+/gi, '링크');
	// 줄바꿈·연속 공백 → 단일 공백
	return text.replace(/\s+/g, ' ').trim();
}

/** 메시지에서 멘션 캐시로 리졸버를 만든 뒤 전처리한다 — 실 lookup은 캐시만 쓰고 fetch하지 않는다. */
export function preprocessTtsMessage(message: Message): string {
	return preprocessTtsText(message.content ?? '', {
		memberName: (id) => {
			const member = message.mentions.members?.get(id);
			if (member) return member.displayName ?? member.user.username;
			return message.mentions.users?.get(id)?.username ?? null;
		},
		roleName: (id) => message.mentions.roles.get(id)?.name ?? null,
		channelName: (id) => {
			const channel = message.mentions.channels.get(id);
			return channel && 'name' in channel ? channel.name : null;
		}
	});
}

interface MergeBatch {
	parts: string[];
	startedAt: number;
	userId: string;
	timer: ReturnType<typeof setTimeout>;
	/** 발화 시작 시점의 사용자 프리셋 — 병합된 메시지는 이 값으로 합성한다 */
	preset?: TtsUserPreset;
}

interface SoloClip {
	url: string;
	text: string;
}

interface GuildTtsState {
	/** key: `${channelId}:${userId}` */
	batches: Map<string, MergeBatch>;
	/** key: userId — 같은 길드에서의 마지막 합성 시각 */
	lastSynthAt: Map<string, number>;
	charWindow: { start: number; chars: number };
	synthActive: number;
	synthWaiters: Array<() => void>;
	dispatchChain: Promise<void>;
	soloQueue: SoloClip[];
}

export class ChatTtsService {
	private readonly guildStates = new Map<string, GuildTtsState>();
	/** 원인별 1회만 warn — 반복되는 동일 원인은 debug로 낮춘다 (명세 4.6) */
	private readonly warned = new Set<string>();

	/**
	 * 채팅 메시지를 받아 스로틀/병합을 거쳐 합성 → dispatch까지 보낸다.
	 * text는 호출자가 preprocessTtsMessage로 전처리한 결과다 (빈 문자열이면 진입하지 않는다).
	 * 실패는 전부 조용히 스킵하고 로그만 남긴다 (명세 4.6).
	 */
	public async handleMessage(message: Message<true>, text: string, preset?: TtsUserPreset): Promise<void> {
		const guildId = message.guildId;
		const channelId = message.channelId;
		const userId = message.author.id;
		const state = this.getGuildState(guildId);
		const now = Date.now();
		const batchKey = `${channelId}:${userId}`;

		const batch = state.batches.get(batchKey);
		if (batch) {
			if (now - batch.startedAt < TTS_MERGE_WINDOW_MS) {
				batch.parts.push(text);
				return;
			}
			// 창을 넘겨 도착한 메시지 — flush 타이머와 경합하는 늦은 입력이라 버린다
			this.warnOnce(guildId, 'merge_window_drop', `[chatTts] 병합 창을 넘긴 메시지를 버렸어요 (guild ${guildId})`);
			return;
		}

		const last = state.lastSynthAt.get(userId) ?? 0;
		if (now - last < TTS_USER_INTERVAL_MS) {
			// 간격 안의 메시지는 새 병합 창을 열어 모았다가 한 발화로 합성한다 — 프리셋은 발화 시작 시점의 값을 쓴다
			const timer = setTimeout(() => {
				void this.flushBatch(guildId, batchKey);
			}, TTS_MERGE_WINDOW_MS);
			state.batches.set(batchKey, { parts: [text], startedAt: now, userId, timer, preset });
			return;
		}

		// 첫 메시지는 지연 없이 바로 합성한다
		state.lastSynthAt.set(userId, now);
		this.enqueueSynthesis(guildId, text.slice(0, TTS_CLIP_MAX_CHARS), preset);
	}

	/** 병합 창 종료 — 모인 메시지를 한 발화로 합성한다. */
	private async flushBatch(guildId: string, batchKey: string): Promise<void> {
		const state = this.guildStates.get(guildId);
		const batch = state?.batches.get(batchKey);
		if (!state || !batch) return;
		state.batches.delete(batchKey);
		clearTimeout(batch.timer);
		state.lastSynthAt.set(batch.userId, Date.now());
		this.enqueueSynthesis(guildId, batch.parts.join(' ').slice(0, TTS_CLIP_MAX_CHARS), batch.preset);
	}

	/** 합성 작업을 길드당 동시 2개 제한 아래로 넣고, dispatch는 메시지 순서대로 이어 붙인다. */
	private enqueueSynthesis(guildId: string, text: string, preset?: TtsUserPreset): void {
		const state = this.getGuildState(guildId);
		const now = Date.now();
		if (now - state.charWindow.start >= 60_000) {
			state.charWindow.start = now;
			state.charWindow.chars = 0;
		}
		state.charWindow.chars += text.length;
		if (state.charWindow.chars > TTS_GUILD_CHARS_PER_MIN) {
			this.warnOnce(
				guildId,
				'char_bucket',
				`[chatTts] 길드 분당 글자 한도(${TTS_GUILD_CHARS_PER_MIN}자) 초과 — 클립을 버렸어요 (guild ${guildId})`
			);
			return;
		}

		const synth = this.withSynthSlot(state, () =>
			container.ttsService.synthesize(text, {
				voice: preset?.voice ?? undefined,
				speed: preset?.speed ?? undefined,
				pitch: preset?.pitch ?? undefined
			})
		);
		// dispatch는 seq 순서로 이어 붙인다 — 합성은 병렬로 끝나도 재생 순서는 메시지 순서를 지킨다
		state.dispatchChain = state.dispatchChain
			.then(async () => {
				let clip: TtsClip;
				try {
					clip = await synth;
				} catch (error) {
					const code = error instanceof TtsError ? error.code : 'error';
					this.warnOnce(guildId, `synth:${code}`, `[chatTts] 합성 실패(${code}) — 클립을 버렸어요 (guild ${guildId}): ${error}`);
					return;
				}
				await this.dispatchClip(guildId, clip, text);
			})
			.catch((error) => {
				container.logger.error(`[chatTts] dispatch failed (guild ${guildId}): ${error}`);
			});
	}

	private async withSynthSlot<T>(state: GuildTtsState, task: () => Promise<T>): Promise<T> {
		if (state.synthActive >= TTS_GUILD_CONCURRENT_SYNTH) {
			await new Promise<void>((resolve) => state.synthWaiters.push(resolve));
		}
		state.synthActive++;
		try {
			return await task();
		} finally {
			state.synthActive--;
			const next = state.synthWaiters.shift();
			if (next) next();
		}
	}

	/** 모드를 dispatch 시점에 재판정한다 (명세 4.2) — 메인 트랙 유무로 오버레이/단독을 가른다. */
	private async dispatchClip(guildId: string, clip: TtsClip, text: string): Promise<void> {
		const player = container.audio.getPlayer(guildId) as CustomPlayer | null | undefined;
		if (!player) return; // 플레이어가 사라졌으면 클립은 조용히 소멸한다
		const hasMusic = (!!player.queue.current && !isTtsClip(player.queue.current)) || player.queue.tracks.some((track) => !isTtsClip(track));
		if (hasMusic) {
			await this.dispatchOverlay(player, clip);
			return;
		}
		await this.dispatchSolo(player, { url: clip.url, text });
	}

	/** 오버레이: mixer announce로 음악 위에 겹쳐 읽는다 (큐잉·순차는 mixer가 담당). */
	private async dispatchOverlay(player: CustomPlayer, clip: TtsClip): Promise<void> {
		try {
			const state = await container.mixerService.getState(player);
			if (state.announcementsQueued > TTS_OVERLAY_QUEUE_MAX) {
				this.warnOnce(
					player.guildId,
					'overlay_overflow',
					`[chatTts] 오버레이 대기(${state.announcementsQueued})가 많아 새 안내를 버렸어요 (guild ${player.guildId})`
				);
				return;
			}
		} catch (error) {
			// state 조회 실패는 거절 근거가 없다 — announce를 시도하고, 그것도 실패하면 조용히 버린다
			container.logger.debug(`[chatTts] mixer state unavailable, trying announce (guild ${player.guildId}): ${error}`);
		}
		await container.mixerService.announce(player, clip.url, TTS_DUCK_LEVEL).catch((error) => {
			this.warnOnce(player.guildId, 'announce_failed', `[chatTts] 오버레이 예약 실패 (guild ${player.guildId}): ${error}`);
		});
	}

	/** 단독: 클립을 메인 플레이어 트랙으로 재생한다. 이미 클립이 이어지는 중이면 내부 큐에 쌓는다. */
	private async dispatchSolo(player: CustomPlayer, clip: SoloClip): Promise<void> {
		const state = this.getGuildState(player.guildId);
		const soloActive = isTtsClip(player.queue.current) || state.soloQueue.length > 0;
		if (soloActive) {
			state.soloQueue.push(clip);
			while (state.soloQueue.length > TTS_SOLO_QUEUE_MAX) {
				state.soloQueue.shift();
				this.warnOnce(
					player.guildId,
					'solo_overflow',
					`[chatTts] 단독 대기 상한(${TTS_SOLO_QUEUE_MAX}) 초과 — 오래된 클립을 버렸어요 (guild ${player.guildId})`
				);
			}
			return;
		}
		const track = await this.resolveTtsClip(player, clip);
		if (!track) return;
		try {
			await player.queue.add(track);
			await container.audioService.ensurePlayback(player);
		} catch (error) {
			this.warnOnce(player.guildId, 'solo_start_failed', `[chatTts] 단독 재생 시작 실패 (guild ${player.guildId}): ${error}`);
		}
	}

	/**
	 * 내부 단독 큐에서 다음 클립을 꺼내 플레이어 큐에 올린다 (재생 시작은 호출부가 결정).
	 * resolve에 실패한 클립은 버리고 다음 클립을 시도한다. 시드할 클립이 없으면 false.
	 */
	public async seedNextSoloClip(player: CustomPlayer): Promise<boolean> {
		const state = this.guildStates.get(player.guildId);
		if (!state) return false;
		while (state.soloQueue.length > 0) {
			const clip = state.soloQueue.shift()!;
			const track = await this.resolveTtsClip(player, clip);
			if (!track) continue;
			try {
				await player.queue.add(track);
			} catch (error) {
				this.warnOnce(player.guildId, 'seed_failed', `[chatTts] 클립 큐 추가 실패 (guild ${player.guildId}): ${error}`);
				continue;
			}
			return true;
		}
		return false;
	}

	/** 음악이 시작되면 남은 단독 큐를 오버레이로 순서대로 넘긴다 (명세 4.3 drain). */
	public async drainSoloQueueToAnnounce(player: CustomPlayer): Promise<void> {
		const state = this.guildStates.get(player.guildId);
		if (!state || state.soloQueue.length === 0) return;
		const clips = state.soloQueue.splice(0, state.soloQueue.length);
		for (const clip of clips) {
			await container.mixerService.announce(player, clip.url, TTS_DUCK_LEVEL).catch((error) => {
				this.warnOnce(player.guildId, 'drain_failed', `[chatTts] 잔여 클립 오버레이 이관 실패 (guild ${player.guildId}): ${error}`);
			});
		}
	}

	public clearSoloQueue(guildId: string): void {
		const state = this.guildStates.get(guildId);
		if (state) state.soloQueue.length = 0;
	}

	/**
	 * 반복 모드가 남긴 TTS 잔재를 걷어낸다 (명세 4.2 반복 제외):
	 * 큐·이전곡의 TTS 클립을 제거하고, current가 '방금 끝난' 클립이면 다음 트랙으로 승격한다.
	 * 이미 새 클립이 current에 올라간 상태(중복 이벤트)면 current는 건드리지 않는다.
	 */
	public scrubTtsClips(player: CustomPlayer, ended: Track | UnresolvedTrack | null): void {
		const tracks = player.queue.tracks;
		if (Array.isArray(tracks)) {
			for (let i = tracks.length - 1; i >= 0; i--) {
				if (isTtsClip(tracks[i])) tracks.splice(i, 1);
			}
		}
		if (isTtsClip(player.queue.current) && this.isSameClip(player.queue.current, ended)) {
			const next = player.queue.tracks.shift();
			player.queue.current = (next ?? null) as typeof player.queue.current;
		}
		const previous = player.queue.previous;
		if (Array.isArray(previous)) {
			for (let i = previous.length - 1; i >= 0; i--) {
				if (isTtsClip(previous[i])) previous.splice(i, 1);
			}
		}
	}

	/**
	 * 이번 종료 이벤트가 TTS 클립 것인지 — 이벤트 트랙의 requester는 서버가 재구성해
	 * 지워질 수 있으므로 시작 확정값(confirmedNowPlaying)으로 한 번 더 확인한다.
	 */
	public isTtsEnded(player: CustomPlayer, track: Track | UnresolvedTrack | null): boolean {
		return isTtsClip(track) || isTtsClip(player.transitionState?.confirmedNowPlaying ?? null);
	}

	/**
	 * TTS가 켜진 길드에서는 큐가 비어도 라이브러리의 idle destroy(10s)를 취소하고 음성에 남는다
	 * (명세 4.2: 음악이 끝나면 다음 채팅부터 단독 낭독 + idle 규칙은 5분 빈 방 타이머).
	 * `internal_queueempty` 키는 lavalink-client의 내부 계약이라 라이브러리 업그레이드에 취약하다.
	 */
	public async keepAliveForTts(player: CustomPlayer): Promise<void> {
		try {
			if (!getTtsConfig()) return;
			const settings = await container.guildService.getTtsSettings(player.guildId);
			if (settings.mode === 'off') return;
			const handle = player.getData<ReturnType<typeof setTimeout> | null | undefined>('internal_queueempty');
			if (handle !== undefined && handle !== null) clearTimeout(handle);
			player.setData('internal_queueempty', undefined);
			container.logger.debug(`[chatTts] idle destroy를 취소하고 음성에 남았어요 (guild ${player.guildId})`);
		} catch (error) {
			container.logger.debug(`[chatTts] keep-alive failed (guild ${player.guildId}): ${error}`);
		}
	}

	/** 플레이어 소멸 시 대기 병합·단독 큐를 버린다. 합성 중인 작업은 끝나면 플레이어 부재로 조용히 소멸한다. */
	public clearGuild(guildId: string): void {
		const state = this.guildStates.get(guildId);
		if (!state) return;
		for (const batch of state.batches.values()) clearTimeout(batch.timer);
		this.guildStates.delete(guildId);
	}

	/** 클립 공개 URL을 Lavalink 트랙으로 resolve하고 제목을 붙인다. 실패 시 null (조용히 폐기). */
	private async resolveTtsClip(player: CustomPlayer, clip: SoloClip): Promise<Track | null> {
		try {
			const result = await player.search({ query: clip.url }, { id: TTS_CLIP_REQUESTER_ID, username: '채팅 TTS' });
			const track = result?.tracks?.[0] as Track | undefined;
			if (!track) {
				this.warnOnce(player.guildId, 'resolve_empty', `[chatTts] 클립 resolve 결과가 비었어요 (guild ${player.guildId})`);
				return null;
			}
			track.info.title = `TTS: ${clip.text.slice(0, 20)}`;
			return track;
		} catch (error) {
			this.warnOnce(player.guildId, 'resolve_failed', `[chatTts] 클립 resolve 실패 (guild ${player.guildId}): ${error}`);
			return null;
		}
	}

	private isSameClip(
		a: Track | UnresolvedTrack | { encoded?: unknown } | null,
		b: Track | UnresolvedTrack | { encoded?: unknown } | null
	): boolean {
		const encodedA = (a as { encoded?: unknown } | null)?.encoded;
		const encodedB = (b as { encoded?: unknown } | null)?.encoded;
		if (typeof encodedA === 'string' && typeof encodedB === 'string') return encodedA === encodedB;
		return a === b;
	}

	private getGuildState(guildId: string): GuildTtsState {
		let state = this.guildStates.get(guildId);
		if (!state) {
			state = {
				batches: new Map(),
				lastSynthAt: new Map(),
				charWindow: { start: Date.now(), chars: 0 },
				synthActive: 0,
				synthWaiters: [],
				dispatchChain: Promise.resolve(),
				soloQueue: []
			};
			this.guildStates.set(guildId, state);
		}
		return state;
	}

	private warnOnce(guildId: string, cause: string, message: string): void {
		const key = `${guildId}:${cause}`;
		if (this.warned.has(key)) {
			container.logger.debug(message);
			return;
		}
		this.warned.add(key);
		container.logger.warn(message);
	}
}
