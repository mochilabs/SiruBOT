import { container } from '@sapphire/framework';
import { Player, Track } from 'lavalink-client';
import { CustomPlayer } from '../modules/audio/lavalink/player/customPlayer.ts';

const MIXER_FILTER_KEY = 'mixer';

// beta 워크플로 스모크 테스트용 주석 (동작 확인 후 제거 예정)

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

/**
 * Lavalink mixer-plugin (`/mixer/*`) REST 래퍼.
 * `player.node.request()`는 `/v4/` prefix라 도달하지 못하므로 plain fetch를 쓴다.
 * fade-in / silence / announce(TTS)는 2단계 scope라 여기서는 다루지 않는다.
 */
export class MixerService {
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
			const error = new Error(`mixer ${path} -> ${res.status}: ${body?.message ?? text}`) as Error & { status?: number };
			error.status = res.status;
			throw error;
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
	 * 다음 곡 1개를 서버에 예열한다. repeat 중이거나 gapless가 꺼져 있거나
	 * 대기열이 비어 있으면 아무 것도 하지 않고 false를 반환한다.
	 */
	public async preloadUpcoming(player: CustomPlayer): Promise<boolean> {
		if (player.repeatMode !== 'off') return false;
		const settings = await container.guildService.getMixerSettings(player.guildId);
		if (!settings.gaplessEnabled) return false;
		const next = player.queue?.tracks?.[0];
		if (!next) return false;
		const ref = this.trackRef(next as Track);
		if (!ref) {
			container.logger.warn(`[mixer] cannot reference upcoming track, skipping preload (guild ${player.guildId})`);
			return false;
		}
		await this.mixerCall(player, '/mixer/queue/next', {
			method: 'POST',
			body: JSON.stringify({ guildId: String(player.guildId), ...ref })
		});
		return true;
	}

	public async clearNext(player: Player): Promise<void> {
		const gid = encodeURIComponent(String(player.guildId));
		await this.mixerCall(player, `/mixer/queue/next?guildId=${gid}`, { method: 'DELETE' });
	}

	/** DB 설정을 서버에 반영한다 (playerCreate 시 1회). */
	public async pushCrossfadeConfig(player: Player): Promise<void> {
		const settings = await container.guildService.getMixerSettings(player.guildId);
		await this.mixerCall(player, '/mixer/crossfade', {
			method: 'POST',
			body: JSON.stringify({ guildId: String(player.guildId), enabled: settings.crossfadeEnabled, durationMs: settings.crossfadeMs })
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
	 * 사용자 스킵 전용: 예열 슬롯을 먼저 비운 뒤 스킵한다.
	 * 직접 `player.skip()`을 부르면 stale 예열곡이 다음 trackEnd 때 재생된다.
	 */
	public async skip(player: Player, position?: number): Promise<void> {
		await this.clearNext(player).catch(() => null);
		await player.skip(position);
	}
}
