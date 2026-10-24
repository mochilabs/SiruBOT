import { container } from '@sapphire/framework';
import { Player, Track } from 'lavalink-client';
import { enqueueOperation, isYouTubeSource } from '@sirubot/utils';

const MIXER_FILTER_KEY = 'mixer';
/** mixer REST 제한 시간(ms) — 타임아웃이 없으면 slot 직렬화 대기열이 응답 없는 노드에서 영원히 안 끝난다. */
const MIXER_CALL_TIMEOUT_MS = Number(process.env.MIXER_CALL_TIMEOUT_MS) || 5_000;
/** overlapEnd(aborted) 직후의 trackEnd만 인정한다 — 그보다 오래된 기록은 무시한다. */
const OVERLAP_ABORT_GRACE_MS = 5_000;

export interface MixerStateResponse {
	guildId: string;
	hasNext: boolean;
	overlayActive: boolean;
	crossfadeActive: boolean;
	crossfadeEnabled: boolean;
	crossfadeMs: number;
	fadeInMs: number;
	duckLevel: number;
	silenceEnabled: boolean;
	silenceThresholdDb: number;
	tailConfirmMs: number;
	nextTrimMs: [number, number] | null;
	announcementsQueued: number;
	/** 서버 슬롯에 예열된 곡의 identifier — 재시작 복구 때 클라이언트 기록과 대조한다. 예전 JAR엔 없을 수 있다. */
	nextTrackIdentifier?: string | null;
	/** 크로스페이드로 진입 중인(sub) 곡의 identifier — 예전 JAR엔 없을 수 있다. */
	subTrackIdentifier?: string | null;
}

/** `POST /mixer/announce` 202 응답 — 안내가 큐에 쌓였다는 영수증. 오버레이 재생 시작이 아니다. */
export interface MixerAnnounceReceipt {
	guildId: string;
	id: number;
	/** 대기 중인 안내 기준 1-based 순번 (현재 재생 중인 오버레이 미포함) */
	position: number;
	/** 이번 등록 이후 대기 안내 수 (현재 재생 중인 오버레이 미포함) */
	queueLength: number;
}

interface MixerCallInit {
	method?: string;
	body?: string;
}

export class MixerRequestError extends Error {
	public constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'MixerRequestError';
	}
}

/**
 * Lavalink mixer-plugin (`/mixer/*`) REST 래퍼.
 * `player.node.request()`는 `/v4/` prefix라 도달하지 못하므로 plain fetch를 쓴다.
 * fade-in / silence는 2단계 scope라 여기서는 다루지 않는다.
 *
 * 서버가 예열 슬롯을 쥔 길드(`preloaded`)는 서버가 content end에 자동 진행하므로
 * 클라이언트는 trackEnd에서 관망해야 하고, 예열하지 않은 길드는 클라이언트가
 * play로 진행한다(TrackHandler 참고). 예열 상태를 TrackHandler/audioService가
 * 공유하므로 여기서 소유한다.
 */
export class MixerService {
	/** 서버 슬롯에 다음 곡을 예열한 길드 (trackEnd에서 consume) */
	private readonly preloaded = new Set<string>();
	/** 서버 슬롯에 예열한 트랙의 identifier — trackStart 때 서버 payload와 대조해 표시용 트랙을 확정한다. */
	private readonly preloadedIdentifiers = new Map<string, string>();
	/** mixer 필터를 체인에 넣은 길드 (노드 재접속 시 리셋) */
	private readonly filterReady = new Set<string>();
	/** 동일 길드의 POST/DELETE가 도착 순서와 다르게 서버 슬롯을 덮어쓰지 않도록 직렬화한다. */
	private readonly slotOperations = new Map<string, Promise<void>>();
	/** 서버에서 overlapEnd(aborted)를 받은 시각(ms) — trackEnd에서 consume한다. */
	private readonly overlapAbortedAt = new Map<string, number>();
	/** 진행 중인 크로스페이드(overlap) 길드 — 값은 incoming(sub) 트랙 identifier 또는 null. */
	private readonly activeOverlaps = new Map<string, string | null>();

	private nodeRest(player: Player): { base: string; auth: string } {
		const o = (player.node?.options ?? {}) as { host?: string; port?: number; authorization?: string; secure?: boolean };
		const proto = o.secure ? 'https' : 'http';
		return { base: `${proto}://${o.host}:${o.port}`, auth: o.authorization ?? '' };
	}

	private async mixerCall(player: Player, path: string, init?: MixerCallInit): Promise<any> {
		const { base, auth } = this.nodeRest(player);
		let res: Response;
		try {
			res = await fetch(`${base}${path}`, {
				method: init?.method ?? 'GET',
				body: init?.body,
				headers: { Authorization: auth, 'Content-Type': 'application/json' },
				signal: AbortSignal.timeout(MIXER_CALL_TIMEOUT_MS)
			});
		} catch (error) {
			// 네트워크 실패·타임아웃을 MixerRequestError로 정규화 — 원시 오류가 slot 직렬화 사슬을
			// 잠그거나 슬래시 커맨드가 원시 에러로 죽는 일을 막는다.
			throw new MixerRequestError(504, `mixer ${path} -> unreachable/timeout: ${error instanceof Error ? error.message : String(error)}`);
		}
		if (res.status === 204) return null;
		let text: string;
		try {
			text = await res.text();
		} catch (error) {
			throw new MixerRequestError(502, `mixer ${path} -> body read failed: ${error instanceof Error ? error.message : String(error)}`);
		}
		let body: any = null;
		try {
			body = text ? JSON.parse(text) : null;
		} catch {
			body = { message: text };
		}
		if (!res.ok) {
			throw new MixerRequestError(res.status, `mixer ${path} -> ${res.status}: ${body?.message ?? text}`);
		}
		return body;
	}

	/** 길드당 1회: mixer 필터를 체인에 삽입한다. `resetFilters()`는 이 키를 지우므로 그 뒤엔 다시 호출해야 한다. */
	public async enableMixerFilter(player: Player): Promise<void> {
		const fm = player.filterManager;
		fm.data.pluginFilters = {
			...((fm.data.pluginFilters ?? {}) as Record<string, unknown>),
			[MIXER_FILTER_KEY]: { guildId: String(player.guildId) }
		} as any;
		await fm.applyPlayerFilters();
	}

	public trackRef(track: Track): { encodedTrack?: string; identifier?: string } | null {
		const encoded = (track as { encoded?: unknown }).encoded;
		if (typeof encoded === 'string' && encoded.length > 0) return { encodedTrack: encoded };
		const info = track.info;
		// YouTube는 identifier가 곧 videoId라 파일 캐시 키와 정확히 일치한다.
		// URI에는 플레이리스트 파라미터(&list= 등)가 붙을 수 있어 서버 측 키 추출을 어긋나게 할 수 있으므로
		// 유튜브 소스에서는 identifier를 우선한다.
		if (isYouTubeSource(info?.sourceName)) {
			const videoId = info?.identifier;
			if (typeof videoId === 'string' && videoId.length > 0) return { identifier: videoId };
		}
		const uri = info?.uri;
		if (typeof uri === 'string' && uri.length > 0) return { identifier: uri };
		const id = info?.identifier;
		if (typeof id === 'string' && id.length > 0) return { identifier: id };
		return null;
	}

	/**
	 * 다음 곡 1개를 서버에 예열한다. repeat 중이거나 갭리스가 꺼져 있거나
	 * 대기열이 비어 있으면 아무 것도 하지 않고 false를 반환한다.
	 * 대기열이 비면 서버 슬롯을 함께 비운다 — 플러그인은 player destroy 시
	 * 상태를 정리하지 않으므로, 남은 stale 예열곡이 content end에 재생되는 것을 막는다.
	 */
	public async preloadUpcoming(player: Player): Promise<boolean> {
		return this.enqueueSlotOperation(String(player.guildId), () => this.preloadUpcomingNow(player));
	}

	private async preloadUpcomingNow(player: Player): Promise<boolean> {
		const gid = String(player.guildId);
		if (player.repeatMode !== 'off') {
			await this.clearNextNow(player).catch(() => null);
			return false;
		}
		const settings = await container.guildService.getMixerSettings(player.guildId);
		if (!settings.gaplessEnabled) {
			await this.clearNextNow(player).catch(() => null);
			return false;
		}
		const next = player.queue?.tracks?.[0];
		if (!next) {
			this.clearPreloadedState(gid);
			await this.clearNextNow(player).catch(() => null);
			return false;
		}
		const ref = this.trackRef(next as Track);
		if (!ref) {
			this.clearPreloadedState(gid);
			await this.clearNextNow(player).catch(() => null);
			container.logger.warn(`[mixer] cannot reference upcoming track, skipping preload (guild ${player.guildId})`);
			return false;
		}
		await this.mixerCall(player, '/mixer/queue/next', {
			method: 'POST',
			body: JSON.stringify({ guildId: gid, ...ref })
		});
		this.preloaded.add(gid);
		// 예열한 트랙의 identifier를 기억해 둔다 — trackStart 때 서버가 시작한 트랙과
		// 대조해 표시용 트랙을 확정한다 (파일 캐시 stale 메타데이터로 서버 payload의
		// encoded가 달라져도 같은 영상이면 봇의 트랙 정보를 단일 source of truth로 쓴다).
		const warmedIdentifier = (next as Track).info?.identifier;
		if (typeof warmedIdentifier === 'string' && warmedIdentifier.length > 0) {
			this.preloadedIdentifiers.set(gid, warmedIdentifier);
		} else {
			this.preloadedIdentifiers.delete(gid);
		}
		return true;
	}

	/** 예열 상태(preloaded + 예열 트랙 식별자)를 함께 비운다. */
	private clearPreloadedState(gid: string): void {
		this.preloaded.delete(gid);
		this.preloadedIdentifiers.delete(gid);
	}

	/**
	 * trackStart에서 소비하는 예열 트랙 식별자 — 반환 후 삭제한다.
	 * 서버가 예열한 곡을 시작했는지 대조하는 진단용이다.
	 */
	public takePreloadedIdentifier(guildId: string): string | null {
		const gid = String(guildId);
		const identifier = this.preloadedIdentifiers.get(gid) ?? null;
		this.preloadedIdentifiers.delete(gid);
		this.activeOverlaps.delete(gid);
		return identifier;
	}

	/** trackEnd 전용: 예열 여부를 소비한다(삭제하고 반환). */
	public consumePreloaded(guildId: string): boolean {
		return this.preloaded.delete(String(guildId));
	}

	/** trackEnd 전용: 최근 overlap abort 여부를 소비한다(삭제하고 반환). 그 이후 기록은 만료된 것으로 본다. */
	public consumeOverlapAbort(guildId: string): boolean {
		const gid = String(guildId);
		const abortedAt = this.overlapAbortedAt.get(gid);
		this.overlapAbortedAt.delete(gid);
		return abortedAt !== undefined && Date.now() - abortedAt <= OVERLAP_ABORT_GRACE_MS;
	}

	/**
	 * 노드 WS `mixer` op를 관찰한다. lavalink-client가 모르는 op라 raw로만 전달된다.
	 * overlapStart는 진행 중 크로스페이드로 기록해(audioService의 관련곡 끊기 판단에 쓴다),
	 * overlapEnd(aborted)는 abort 직후의 trackEnd가 서버 자동 진행이 아님을 TrackHandler에 알린다.
	 */
	public observeMixerEvent(payload: unknown): void {
		const data = payload as { type?: unknown; reason?: unknown; guildId?: unknown; track?: { identifier?: unknown } | null } | null;
		if (!data || typeof data.guildId !== 'string') return;
		const gid = String(data.guildId);
		if (data.type === 'overlapStart') {
			const trackId = typeof data.track?.identifier === 'string' ? data.track.identifier : null;
			this.activeOverlaps.set(gid, trackId);
			return;
		}
		if (data.type === 'overlapEnd') {
			this.activeOverlaps.delete(gid);
			if (data.reason === 'aborted') this.overlapAbortedAt.set(gid, Date.now());
		}
	}

	/** 서버가 overlapStart를 알린 뒤 overlapEnd를 받지 못했으면 true — 크로스페이드 진행 중이다. */
	public isOverlapActive(guildId: string): boolean {
		return this.activeOverlaps.has(String(guildId));
	}

	/** 진행 중 크로스페이드의 incoming(sub) 트랙 identifier — 서버가 트랙 정보를 안 줬으면 null이다. */
	public getOverlapTrackIdentifier(guildId: string): string | null {
		return this.activeOverlaps.get(String(guildId)) ?? null;
	}

	/** 서버 슬롯에 예열된 곡이 남아 있으면 true — 서버가 content end에 자동 진행한다. */
	public isPreloaded(guildId: string): boolean {
		return this.preloaded.has(String(guildId));
	}

	/** 예열이 이뤄지지 않은 길드로 표시한다(클라이언트가 전이를 소유). */
	public markUnmanaged(guildId: string): void {
		this.clearPreloadedState(String(guildId));
		this.activeOverlaps.delete(String(guildId));
	}

	/**
	 * 봇 재시작 뒤 서버에 살아남은 mixer 상태와 클라이언트 기록을 맞춘다.
	 *
	 * session resume이 성공하면 서버는 예열 슬롯과 필터를 그대로 들고 있지만 새
	 * 프로세스의 preloaded 기록은 비어 있어, 첫 trackEnd에서 관망(서버 소유 진행)
	 * 대신 클라이언트 진행으로 새어 갭·이중 재생처럼 보인다. /mixer/state로 서버
	 * 슬롯을 확인해 대기열 머리와 같은 곡이면 채택하고, 아니면 다시 예열한다.
	 */
	public async reconcileAfterResume(player: Player): Promise<void> {
		const gid = String(player.guildId);
		let state: MixerStateResponse;
		try {
			state = await this.getState(player);
		} catch (error) {
			if (error instanceof MixerRequestError && error.status === 404) {
				// GuildMixer가 없다 = 서버가 플러그인 상태를 잃었다(예: 노드 재시작).
				// 클라이언트 소유 진행으로 두고 다음 play에서 다시 prime한다.
				this.markUnmanaged(gid);
				this.markFiltersStale(gid);
				return;
			}
			// 네트워크 실패 등은 기록을 모르는 채로 둔다 — 기존 클라이언트 진행 동작이 그대로 이어진다.
			container.logger.warn(`[mixer] state probe failed after restore (guild ${player.guildId}): ${error}`);
			return;
		}

		// 오버랩이 진행 중이면 손대지 않는다 — trackStart가 wiring을 다시 수행한다.
		// 대신 incoming(sub) 트랙 식별자를 기록해 관련곡 크로스페이드 끊기 판단에 쓴다.
		if (state.crossfadeActive) {
			this.activeOverlaps.set(gid, state.subTrackIdentifier ?? null);
			return;
		}

		const head = player.queue?.tracks?.[0];
		if (!head) {
			// 대기열이 비었는데 슬롯이 남아 있으면 stale 곡이 발화하는 것을 막는다.
			this.clearPreloadedState(gid);
			if (state.hasNext) await this.clearNext(player).catch(() => null);
			return;
		}

		const headIdentifier = head.info?.identifier;
		if (state.hasNext && typeof headIdentifier === 'string' && state.nextTrackIdentifier === headIdentifier) {
			// 서버 슬롯이 대기열 머리와 같은 곡 → 그대로 채택해 첫 전이를 서버 소유로 잇는다.
			this.preloaded.add(gid);
			this.preloadedIdentifiers.set(gid, headIdentifier);
			return;
		}

		// 슬롯이 비었거나 다른 곡이다 → 기록을 비우고 머리 곡으로 다시 예열한다.
		this.clearPreloadedState(gid);
		await this.clearNext(player).catch(() => null);
		await this.preloadUpcoming(player);
	}

	public async clearNext(player: Player): Promise<void> {
		await this.enqueueSlotOperation(String(player.guildId), () => this.clearNextNow(player));
	}

	private async clearNextNow(player: Player): Promise<void> {
		const gid = encodeURIComponent(String(player.guildId));
		// REST가 성공해야 봇 Set도 정리한다 — 실패 시 서버 슬롯이 남는데 Set만 비우면
		// trackEnd의 consumePreloaded()=false로 클라이언트 진행과 서버 자동 진행이
		// 병행돼 두 곡이 연달아 소비된다(trackHandler 참고).
		try {
			await this.mixerCall(player, `/mixer/queue/next?guildId=${gid}`, { method: 'DELETE' });
		} catch (error) {
			// 404는 슬롯이 이미 없다는 뜻이므로 정리된 것으로 본다.
			if (error instanceof MixerRequestError && error.status === 404) {
				this.clearPreloadedState(String(player.guildId));
				return;
			}
			throw error;
		}
		this.clearPreloadedState(String(player.guildId));
	}

	/** 같은 길드의 슬롯 조작을 순차 실행 — 공용 enqueueOperation으로 직렬화해요. */
	private enqueueSlotOperation<T>(guildId: string, operation: () => Promise<T>): Promise<T> {
		return enqueueOperation(this.slotOperations, guildId, operation);
	}

	/** DB 설정을 서버에 반영한다 (playerCreate 시 1회). */
	public async pushCrossfadeConfig(player: Player): Promise<void> {
		const settings = await container.guildService.getMixerSettings(player.guildId);
		// 상한 도입 전에 길게 저장돼 있던 값도 플러그인에 깨지지 않게 잘라요 (최대 15초)
		const durationMs = Math.min(15000, Math.max(500, settings.crossfadeMs));
		await this.mixerCall(player, '/mixer/crossfade', {
			method: 'POST',
			body: JSON.stringify({ guildId: String(player.guildId), enabled: settings.crossfadeEnabled, durationMs })
		});
	}

	/**
	 * 길드당 1회: mixer 필터 삽입 + DB 크로스페이드 설정 반영.
	 * `resetFilters()`는 mixer 키를 지우므로 그 뒤엔 다시 호출해야 한다.
	 * 실패 시(노드 미준비 등) 다음 `primeForPlay()`/trackStart에서 재시도된다.
	 */
	public async ensureMixerFilter(player: Player): Promise<void> {
		const gid = String(player.guildId);
		if (this.filterReady.has(gid)) return;
		await this.enableMixerFilter(player);
		await this.pushCrossfadeConfig(player);
		this.filterReady.add(gid);
	}

	/** 노드 재접속 등 서버 상태가 사라졌을 수 있을 때 초기화 — 다음 play 이전에 재적용된다. */
	public resetFilterReadiness(): void {
		this.filterReady.clear();
	}

	/**
	 * 플레이어가 파괴되면 서버의 필터 상태도 함께 사라진다.
	 * 다음 play 전에 다시 prime할 수 있도록 준비 플래그를 비운다.
	 */
	public markFiltersStale(guildId: string): void {
		this.filterReady.delete(String(guildId));
	}

	/**
	 * `player.play()`보다 **먼저** 호출해야 한다.
	 *
	 * lavaplayer는 트랙을 시작하는 순간에만 필터 체인을 한 번 만들고 그때의
	 * filterFactory만 읽는다. `setFilterFactory()`는 `AtomicReference.set()`만 하고,
	 * 체인 재빌드를 걸러야 하는 `filterHotSwapEnabled`는 기본값이 false라
	 * `checkRebuild()`가 no-op이다 → 이미 재생 중인 트랙에는 절대 반영되지 않는다.
	 *
	 * 같은 updatePlayer op 안이면 `PlayerRestHandler`가 filters(:175)를 play(:223)보다
	 * 앞에 적용하므로 안전하고, op가 달라도 filters가 play보다 먼저 도착하면
	 * 트랙 시작 시점의 체인 생성에 그대로 반영된다. 문제는 play를 먼저 보낸 뒤
	 * 다음 op로 filters를 보내는 경우뿐이다.
	 */
	public async primeForPlay(player: Player): Promise<void> {
		if (this.filterReady.has(String(player.guildId))) return;
		await this.ensureMixerFilter(player).catch((error) => {
			container.logger.warn(`[mixer] prime filters failed (guild ${player.guildId}): ${error}`);
		});
	}

	/**
	 * `resetFilters()`는 `fm.data`를 기본값으로 되돌리므로 mixer 키도 지운다.
	 * 초기화 경로는 이 메서드로 대체한다.
	 */
	public async reapplyMixerFilter(player: Player): Promise<void> {
		this.filterReady.delete(String(player.guildId));
		await this.ensureMixerFilter(player).catch((error) => {
			container.logger.warn(`[mixer] mixer filter re-apply failed (guild ${player.guildId}): ${error}`);
		});
	}

	public async setCrossfade(player: Player, enabled: boolean, durationMs?: number): Promise<MixerStateResponse> {
		return (await this.mixerCall(player, '/mixer/crossfade', {
			method: 'POST',
			body: JSON.stringify({ guildId: String(player.guildId), enabled, durationMs })
		})) as MixerStateResponse;
	}

	public async getState(player: Player): Promise<MixerStateResponse> {
		const gid = encodeURIComponent(String(player.guildId));
		return (await this.mixerCall(player, `/mixer/state?guildId=${gid}`)) as MixerStateResponse;
	}

	/**
	 * 현재 재생 중인 오디오 위에 안내 음성을 섞고, 원곡 볼륨을 일시적으로 낮춘다.
	 * 서버가 예전에 안내를 재생 중이어도 409가 아니라 큐에 쌓이고, 순차 재생된다.
	 * 반환 영수증의 `position`으로 대기 순번을 안내할 수 있다 (성공 ≠ 재생 시작).
	 */
	public async announce(player: Player, identifier: string, duckLevel: number): Promise<MixerAnnounceReceipt> {
		return (await this.mixerCall(player, '/mixer/announce', {
			method: 'POST',
			body: JSON.stringify({ guildId: String(player.guildId), identifier, duckLevel })
		})) as MixerAnnounceReceipt;
	}

	/**
	 * 사용자 스킵 전용: 예열 슬롯을 먼저 비운 뒤 스킵한다.
	 * 직접 `player.skip()`을 부르면 stale 예열곡이 다음 trackEnd 때 재생된다.
	 * 슬롯 정리 실패를 삼키면(stale 곡 발화의 통로) 그대로 전파한다 — 호출부가
	 * 사용자 안내로 변환하거나 watchdog 복구에 맡긴다.
	 */
	public async skip(player: Player, position?: number): Promise<void> {
		// 스킵이 곧 overlap 종료다 — stale 기록이 남으면 다음 enqueueTrack이 관련곡
		// 크로스페이드로 오판한다. clearPreloadedState는 여기서 안 지우므로 따로 뺀다.
		this.activeOverlaps.delete(String(player.guildId));
		await this.clearNext(player);
		await player.skip(position);
	}

	/** 정지·소멸 경로 전용: 슬롯 정리 실패를 1회 재시도하고, 그래도 실패하면 로그로 남긴다. */
	public async clearNextLenient(player: Player): Promise<void> {
		try {
			await this.clearNext(player);
		} catch {
			try {
				await this.clearNext(player);
			} catch (retryError) {
				container.logger.warn(`[mixer] clearNext failed twice (guild ${player.guildId}); stale slot heals on next prime: ${retryError}`);
			}
		}
	}
}
