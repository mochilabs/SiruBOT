import { emoji } from '@sirubot/utils';
import { MUSIC_VOLUME_MAX, MUSIC_VOLUME_MIN } from '@sirubot/utils/playerLimits';
import { AppError } from '../../../lib/appError.ts';
import type { Actor } from './actor.ts';
import { MUSIC_ACCESS_MESSAGES, type MusicAccess } from './access.ts';

export type MusicRepeatMode = 'off' | 'track' | 'queue';

const REPEAT_MODES: readonly MusicRepeatMode[] = ['off', 'track', 'queue'];

function isRepeatMode(value: string): value is MusicRepeatMode {
	return REPEAT_MODES.some((mode) => mode === value);
}

export interface PlayerPort {
	readonly paused: boolean;
	readonly playing: boolean;
	readonly queue: {
		readonly current: TrackPort | null;
		readonly tracks: readonly unknown[];
		readonly previous: readonly unknown[];
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

export interface TrackSummaryPort {
	readonly info: {
		readonly duration?: number;
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
		saveVolume(guildId: string, volume: number): Promise<number>;
		saveRepeat(guildId: string, mode: MusicRepeatMode): Promise<MusicRepeatMode>;
	};
	mixer: {
		clearNext(player: P): Promise<unknown>;
		skip(player: P, position?: number): Promise<unknown>;
	};
	playback: {
		ensurePlayback(player: P): Promise<unknown>;
		stopPlayback(player: P): Promise<unknown>;
		removeController(player: P): Promise<unknown>;
		playPrevious(player: P): Promise<TrackSummaryPort>;
	};
}

export interface MusicControl {
	setVolume(actor: Actor, volume: number): Promise<{ volume: number; playing: boolean }>;
	pause(actor: Actor): Promise<{ paused: true }>;
	resume(actor: Actor): Promise<{ resumed: true }>;
	setRepeat(actor: Actor, mode: string): Promise<{ mode: MusicRepeatMode; playing: boolean }>;
	seek(actor: Actor, positionMs: number): Promise<{ positionMs: number; track: TrackPort }>;
	stop(actor: Actor): Promise<{ stopped: true }>;
	skipNow(actor: Actor, options?: { to?: number }): Promise<{ skipped: true }>;
	skipApproved(guildId: string, options?: { to?: number }): Promise<{ skipped: true }>;
	previous(actor: Actor): Promise<{ track: TrackSummaryPort }>;
}

export function createMusicControl<P extends PlayerPort>(deps: MusicControlDeps<P>): MusicControl {
	const { access, getPlayer, settings, mixer, playback } = deps;

	function requireSong(guildId: string): { player: P; current: TrackPort } {
		const player = getPlayer(guildId);
		const current = player?.queue.current;
		if (!player || !current) throw new AppError('not_found', MUSIC_ACCESS_MESSAGES.noSong(), { ephemeral: true });
		return { player, current };
	}

	async function skipCurrent(guildId: string, options: { to?: number }): Promise<{ skipped: true }> {
		const { player } = requireSong(guildId);
		const { to } = options;
		if (to !== undefined && (!Number.isInteger(to) || to < 1)) {
			throw new AppError('invalid_input', `${emoji('error')} 건너뛸 곡 번호가 올바르지 않아요.`, { ephemeral: true });
		}
		if (to !== undefined && player.queue.tracks.length === 0) {
			throw new AppError('not_found', `${emoji('error')} 대기열에 곡이 없어요.`, { ephemeral: true });
		}
		await mixer.skip(player, to);
		return { skipped: true };
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
		},

		async skipNow(actor, options = {}) {
			await access.authorize(actor);
			return skipCurrent(actor.guildId, options);
		},

		skipApproved(guildId, options = {}) {
			return skipCurrent(guildId, options);
		},

		async previous(actor) {
			await access.authorize(actor);
			const player = getPlayer(actor.guildId);
			if (!player) throw new AppError('not_found', `${emoji('error')} 현재 재생 중인 플레이어가 없어요.`, { ephemeral: true });
			if (player.queue.previous.length === 0) {
				throw new AppError('not_found', `${emoji('error')} 이전에 재생한 곡이 없어요.`, { ephemeral: true });
			}
			const track = await playback.playPrevious(player);
			return { track };
		}
	};
}
