import { container } from '@sapphire/framework';
import { Player, Track } from 'lavalink-client';

const MIXER_FILTER_KEY = 'mixer';

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
	/** mixer 필터를 체인에 넣은 길드 (노드 재접속 시 리셋) */
	private readonly filterReady = new Set<string>();
	/** 동일 길드의 POST/DELETE가 도착 순서와 다르게 서버 슬롯을 덮어쓰지 않도록 직렬화한다. */
	private readonly slotOperations = new Map<string, Promise<void>>();

	private nodeRest(player: Player): { base: string; auth: string } {
		const o = (player.node?.options ?? {}) as { host?: string; port?: number; authorization?: string; secure?: boolean };
		const proto = o.secure ? 'https' : 'http';
		return { base: `${proto}://${o.host}:${o.port}`, auth: o.authorization ?? '' };
	}

	private async mixerCall(player: Player, path: string, init?: MixerCallInit): Promise<any> {
		const { base, auth } = this.nodeRest(player);
		const res = await fetch(`${base}${path}`, {
			method: init?.method ?? 'GET',
			body: init?.body,
			headers: { Authorization: auth, 'Content-Type': 'application/json' }
		});
		if (res.status === 204) return null;
		const text = await res.text();
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
		const uri = track.info?.uri;
		if (typeof uri === 'string' && uri.length > 0) return { identifier: uri };
		const id = track.info?.identifier;
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
			this.preloaded.delete(gid);
			await this.clearNextNow(player).catch(() => null);
			return false;
		}
		const ref = this.trackRef(next as Track);
		if (!ref) {
			this.preloaded.delete(gid);
			await this.clearNextNow(player).catch(() => null);
			container.logger.warn(`[mixer] cannot reference upcoming track, skipping preload (guild ${player.guildId})`);
			return false;
		}
		await this.mixerCall(player, '/mixer/queue/next', {
			method: 'POST',
			body: JSON.stringify({ guildId: gid, ...ref })
		});
		this.preloaded.add(gid);
		return true;
	}

	/** trackEnd 전용: 예열 여부를 소비한다(삭제하고 반환). */
	public consumePreloaded(guildId: string): boolean {
		return this.preloaded.delete(String(guildId));
	}

	/** 서버 슬롯에 예열된 곡이 남아 있으면 true — 서버가 content end에 자동 진행한다. */
	public isPreloaded(guildId: string): boolean {
		return this.preloaded.has(String(guildId));
	}

	/** 예열이 이뤄지지 않은 길드로 표시한다(클라이언트가 전이를 소유). */
	public markUnmanaged(guildId: string): void {
		this.preloaded.delete(String(guildId));
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
				this.preloaded.delete(String(player.guildId));
				return;
			}
			throw error;
		}
		this.preloaded.delete(String(player.guildId));
	}

	private async enqueueSlotOperation<T>(guildId: string, operation: () => Promise<T>): Promise<T> {
		const previous = this.slotOperations.get(guildId) ?? Promise.resolve();
		const result = previous.catch(() => undefined).then(operation);
		const completed = result.then(
			() => undefined,
			() => undefined
		);
		this.slotOperations.set(guildId, completed);
		void completed.finally(() => {
			if (this.slotOperations.get(guildId) === completed) this.slotOperations.delete(guildId);
		});
		return result;
	}

	/** DB 설정을 서버에 반영한다 (playerCreate 시 1회). */
	public async pushCrossfadeConfig(player: Player): Promise<void> {
		const settings = await container.guildService.getMixerSettings(player.guildId);
		await this.mixerCall(player, '/mixer/crossfade', {
			method: 'POST',
			body: JSON.stringify({ guildId: String(player.guildId), enabled: settings.crossfadeEnabled, durationMs: settings.crossfadeMs })
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

	/** 현재 재생 중인 오디오 위에 안내 음성을 섞고, 원곡 볼륨을 일시적으로 낮춘다. */
	public async announce(player: Player, identifier: string, duckLevel: number): Promise<void> {
		await this.mixerCall(player, '/mixer/announce', {
			method: 'POST',
			body: JSON.stringify({ guildId: String(player.guildId), identifier, duckLevel })
		});
	}

	/**
	 * 사용자 스킵 전용: 예열 슬롯을 먼저 비운 뒤 스킵한다.
	 * 직접 `player.skip()`을 부르면 stale 예열곡이 다음 trackEnd 때 재생된다.
	 */
	public async skip(player: Player, position?: number): Promise<void> {
		await this.clearNext(player).catch(() => null);
		await player.skip(position);
	}
}
