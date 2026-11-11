import { emoji } from '@sirubot/utils';
import { MUSIC_VOLUME_MAX, MUSIC_VOLUME_MIN } from '@sirubot/utils/playerLimits';
import { AppError } from '../../../lib/appError.ts';
import type { Actor } from './actor.ts';
import type { MusicAccess } from './access.ts';

/**
 * 음악 제어 유스케이스 — 슬래시, 컨트롤러 버튼, 대시보드 웹 플레이어, AI 도구가 함께 쓰는 단일 구현이에요.
 * 인터랙션을 받지도 응답하지도 않고, 사용자에게 보여줄 문구는 `AppError`에 실어 던져요.
 * 모든 의존성은 `createMusicControl(deps)`로 명시적으로 받아요 (전역 container 접근 없음).
 */

export type MusicRepeatMode = 'off' | 'track' | 'queue';

/** 유스케이스가 플레이어에서 쓰는 최소 면 — 실제 구현은 CustomPlayer, 테스트는 평범한 가짜예요. */
export interface PlayerPort {
	readonly paused: boolean;
	readonly playing: boolean;
	readonly queue: {
		readonly current: TrackPort | null;
		readonly tracks: readonly unknown[];
	};
	pause(): Promise<unknown>;
	resume(): Promise<unknown>;
	seek(positionMs: number): Promise<unknown>;
	setVolume(volume: number): Promise<unknown>;
	setRepeatMode(mode: MusicRepeatMode): Promise<unknown>;
}

export interface TrackPort {
	readonly info: {
		readonly duration: number;
		readonly isStream: boolean;
		readonly title?: string;
		readonly author?: string;
		readonly uri?: string;
		readonly artworkUrl?: string | null;
	};
}

export interface MusicControlDeps<P extends PlayerPort> {
	access: MusicAccess;
	getPlayer(guildId: string): P | undefined;
	settings: {
		/** 길드 기본 볼륨을 저장하고 저장된 값을 돌려줘요. */
		saveVolume(guildId: string, volume: number): Promise<number>;
	};
}

export interface MusicControl {
	/** 길드 볼륨을 저장하고 플레이어가 있으면 바로 반영해요. */
	setVolume(actor: Actor, volume: number): Promise<{ volume: number; playing: boolean }>;
}

export function createMusicControl<P extends PlayerPort>(deps: MusicControlDeps<P>): MusicControl {
	const { access, getPlayer, settings } = deps;

	return {
		async setVolume(actor, volume) {
			await access.authorize(actor);
			if (!Number.isInteger(volume) || volume < MUSIC_VOLUME_MIN || volume > MUSIC_VOLUME_MAX) {
				throw new AppError(
					'invalid_input',
					`${emoji('error')} 노래 볼륨은(는) **${MUSIC_VOLUME_MIN}**부터 **${MUSIC_VOLUME_MAX}**까지 설정할 수 있어요.`,
					{
						ephemeral: true
					}
				);
			}
			const saved = await settings.saveVolume(actor.guildId, volume);
			const player = getPlayer(actor.guildId);
			if (player) await player.setVolume(saved);
			return { volume: saved, playing: player !== undefined };
		}
	};
}
