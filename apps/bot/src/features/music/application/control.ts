import { emoji } from '@sirubot/utils';
import { MUSIC_VOLUME_MAX, MUSIC_VOLUME_MIN } from '@sirubot/utils/playerLimits';
import { AppError } from '../../../lib/appError.ts';
import type { Actor } from './actor.ts';
import { MUSIC_ACCESS_MESSAGES, type MusicAccess } from './access.ts';

/**
 * 음악 제어 유스케이스 — 슬래시, 컨트롤러 버튼, 대시보드 웹 플레이어, AI 도구가 함께 쓰는 단일 구현이에요.
 * 인터랙션을 받지도 응답하지도 않고, 사용자에게 보여줄 문구는 `AppError`에 실어 던져요.
 * 모든 의존성은 `createMusicControl(deps)`로 명시적으로 받아요 (전역 container 접근 없음).
 */

export type MusicRepeatMode = 'off' | 'track' | 'queue';

const REPEAT_MODES: readonly MusicRepeatMode[] = ['off', 'track', 'queue'];

function isRepeatMode(value: string): value is MusicRepeatMode {
	return REPEAT_MODES.some((mode) => mode === value);
}

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
		/** 길드 반복 모드를 저장하고 저장된 값을 돌려줘요. */
		saveRepeat(guildId: string, mode: MusicRepeatMode): Promise<MusicRepeatMode>;
	};
	mixer: {
		/** mixer 예열 슬롯을 비워요. 반복 모드 전이는 클라이언트가 소유하므로 모드가 바뀔 때마다 필요해요. */
		clearNext(player: P): Promise<unknown>;
	};
	playback: {
		/** 멈춰 있던 플레이어가 대기열을 다시 재생하게 해요. */
		ensurePlayback(player: P): Promise<unknown>;
		/** 정지 공용 흐름 — queueEnd 안내를 억제하고 대기열·mixer 슬롯을 비운 뒤 재생을 끊고 음성 채널에서 나가요. */
		stopPlayback(player: P): Promise<unknown>;
		/** 컨트롤러 메시지를 지워요. */
		removeController(player: P): Promise<unknown>;
	};
}

export interface MusicControl {
	/** 길드 볼륨을 저장하고 플레이어가 있으면 바로 반영해요. */
	setVolume(actor: Actor, volume: number): Promise<{ volume: number; playing: boolean }>;
	/** 현재 곡을 일시정지해요. 이미 일시정지 상태여도 오류 없이 성공해요. */
	pause(actor: Actor): Promise<{ paused: true }>;
	/** 일시정지를 풀어요. 일시정지가 아니지만 멈춰 있으면 대기열 재생을 다시 시작해요. */
	resume(actor: Actor): Promise<{ resumed: true }>;
	/** 반복 모드(off|track|queue)를 길드에 저장하고 플레이어가 있으면 반영해요. 알 수 없는 값은 invalid_input이에요. */
	setRepeat(actor: Actor, mode: string): Promise<{ mode: MusicRepeatMode; playing: boolean }>;
	/** 현재 곡의 특정 위치(ms)로 이동해요. 실시간 스트림, 음수·비정상 값, 곡 길이 초과는 거절해요. */
	seek(actor: Actor, positionMs: number): Promise<{ positionMs: number; track: TrackPort }>;
	/** 컨트롤러를 지우고 대기열을 비운 뒤 재생을 멈추고 음성 채널에서 나가요. 플레이어가 없으면 거절해요. */
	stop(actor: Actor): Promise<{ stopped: true }>;
}

export function createMusicControl<P extends PlayerPort>(deps: MusicControlDeps<P>): MusicControl {
	const { access, getPlayer, settings, mixer, playback } = deps;

	/** 재생 중인 곡(현재 곡)이 있는 플레이어 — 없으면 슬래시 SongPlaying과 같은 문구로 거절해요. */
	function requireSong(guildId: string): { player: P; current: TrackPort } {
		const player = getPlayer(guildId);
		const current = player?.queue.current;
		if (!player || !current) throw new AppError('not_found', MUSIC_ACCESS_MESSAGES.noSong(), { ephemeral: true });
		return { player, current };
	}

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
		},

		async pause(actor) {
			await access.authorize(actor);
			const { player } = requireSong(actor.guildId);
			if (!player.paused) await player.pause();
			return { paused: true };
		},

		async resume(actor) {
			await access.authorize(actor);
			const player = getPlayer(actor.guildId);
			if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
				throw new AppError('not_found', `${emoji('error')} 이어 재생할 곡이 없어요. /재생으로 곡을 추가해 주세요.`, { ephemeral: true });
			}
			if (player.paused) await player.resume();
			else if (!player.playing) await playback.ensurePlayback(player);
			return { resumed: true };
		},

		async setRepeat(actor, mode) {
			await access.authorize(actor);
			if (!isRepeatMode(mode)) throw new AppError('invalid_input', `${emoji('error')} 잘못된 반복 모드 값이에요.`, { ephemeral: true });
			const saved = await settings.saveRepeat(actor.guildId, mode);
			const player = getPlayer(actor.guildId);
			if (player) {
				await player.setRepeatMode(saved);
				// 'off'로 바뀔 때도 슬롯을 비워야 해요 — track-repeat 중 예열된 현재 곡이 off 전환 뒤에도 남아 ghost-repeat으로 재생되는 것을 막아요.
				await mixer.clearNext(player).catch(() => null);
			}
			return { mode: saved, playing: player !== undefined };
		},

		async seek(actor, positionMs) {
			await access.authorize(actor);
			const { player, current } = requireSong(actor.guildId);
			if (current.info.isStream) {
				throw new AppError('invalid_input', `${emoji('error')} 실시간 스트리밍에서는 탐색을 사용할 수 없어요.`, { ephemeral: true });
			}
			if (!Number.isFinite(positionMs) || positionMs < 0) {
				throw new AppError('invalid_input', `${emoji('error')} 올바른 시간 형식이 아니에요. (예: \`1:30\`, \`90\`, \`0:45\`)`, {
					ephemeral: true
				});
			}
			if (positionMs > current.info.duration) {
				throw new AppError('invalid_input', `${emoji('error')} 곡의 길이를 초과하는 시간이에요.`, { ephemeral: true });
			}
			await player.seek(positionMs);
			return { positionMs, track: current };
		},

		async stop(actor) {
			await access.authorize(actor);
			// 현재 곡이 없어도 플레이어가 있으면 멈출 수 있어요 (예: 채팅 TTS만 켜져 음성 채널에 남아 있는 경우).
			const player = getPlayer(actor.guildId);
			if (!player) throw new AppError('not_found', `${emoji('error')} 재생 중인 곡이 없어요.`, { ephemeral: true });
			await playback.removeController(player).catch(() => null);
			await playback.stopPlayback(player);
			return { stopped: true };
		}
	};
}
