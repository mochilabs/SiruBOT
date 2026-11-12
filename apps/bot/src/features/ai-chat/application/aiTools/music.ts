import type { SearchPlatform } from 'lavalink-client';
import { VOICE_CHANNEL_REQUIRED_MESSAGE } from '@sirubot/utils';
import {
	applyFilterPreset,
	checkDJOrAlone,
	dropLoserFilters,
	FILTER_PRESET_NAMES,
	getUserQueuedTracks,
	isFilterPreset,
	isSameTrack,
	nowPlayingTrack,
	parseTimeToMs,
	removeStaleRelatedTracks,
	resetAllFilters,
	type CustomPlayer
} from '../../../music/index.ts';
import type { AiToolDeps } from './deps.ts';
import type { AiTool, AiToolContext } from './types.ts';
import { musicActor, withAppError } from './musicControlBridge.ts';
import { searchLyrics } from '../../../../services/dataApiClient.ts';
import * as guildPlayback from '../../../../services/guildSettings/playback.ts';

const PLATFORM_MAP: Record<string, SearchPlatform> = {
	youtube: 'ytsearch',
	spotify: 'spsearch',
	soundcloud: 'scsearch'
};

function requireGuild(ctx: AiToolContext): string {
	if (!ctx.guildId) throw new Error('서버 채널에서만 음악을 사용할 수 있어요.');
	return ctx.guildId;
}

function requireVoice(ctx: AiToolContext): { guildId: string; voiceChannelId: string } {
	const guildId = requireGuild(ctx);
	if (!ctx.voiceChannelId) throw new Error(VOICE_CHANNEL_REQUIRED_MESSAGE);
	return { guildId, voiceChannelId: ctx.voiceChannelId };
}

/** 슬래시 커맨드의 DJOrAlone precondition과 동일한 검사 — 서버 컨텍스트 + member 필요 */
async function requireDjOrAlone(ctx: AiToolContext): Promise<void> {
	const guildId = requireGuild(ctx);
	if (!ctx.member) throw new Error('DM에서는 음악을 제어할 수 없어요.');
	const allowed = await checkDJOrAlone(guildId, ctx.member);
	if (!allowed) throw new Error('이 작업은 DJ 역할을 가지고 있거나, 채널에 혼자 있을 때만 사용 가능해요.');
}

/** 음악 제어 도구를 만들어요 — 의존성은 deps로 받아요 */
export function createMusicTools(
	deps: Pick<AiToolDeps, 'db' | 'guildService' | 'audioService' | 'mixerService' | 'playlistService' | 'getMusic' | 'getMusicPlay' | 'getAudio'>
): AiTool[] {
	function requirePlayer(guildId: string) {
		const player = deps.getAudio()!.getPlayer(guildId);
		if (!player) throw new Error('현재 재생 중인 곡이 없어요.');
		return player;
	}

	function trackInfo(track: { info: { title?: string; author?: string; duration?: number; uri?: string; artworkUrl?: string | null } }) {
		return {
			title: track.info.title ?? '(제목 미상)',
			author: track.info.author ?? '',
			length_ms: track.info.duration ?? 0,
			url: track.info.uri ?? '',
			thumbnail: track.info.artworkUrl ?? ''
		};
	}

	const musicPlayTool: AiTool = {
		name: 'music_play',
		description:
			'음성 채널에서 음악을 재생해요. 봇이 있는 음성 채널에 곡을 넣고, 사용자는 그 채널에 있어야 해요 (관리자·서버 관리·DJ 역할은 밖에서도 가능). 제목·아티스트·URL을 검색어로 넘기세요. 플레이리스트 결과는 앞 100곡까지 대기열에 넣어요. source: youtube(기본)|spotify|soundcloud.',
		properties: {
			query: {
				type: 'string',
				description: '곡 제목, 아티스트, 또는 URL'
			},
			source: {
				type: 'string',
				description: '검색 소스 (기본 youtube)',
				enum: ['youtube', 'spotify', 'soundcloud']
			}
		},
		required: ['query'],
		status: '시루가 음악을 찾는 중..',
		execute: async (args, ctx) => {
			// 음성 채널 정책(어느 채널에 넣을지, 누가 넣을 수 있는지)은 공용 유스케이스가 맡아요.
			const actor = musicActor(ctx);
			const query = String(args.query ?? '').trim();
			if (!query) throw new Error('검색어가 필요해요.');
			const sourceKey = String(args.source ?? 'youtube');
			const platform = PLATFORM_MAP[sourceKey] ?? 'ytsearch';

			const result = await withAppError(() =>
				deps
					.getMusicPlay()
					.play(
						actor,
						{ query, platform, requester: { id: ctx.userId, username: ctx.username }, textChannelId: ctx.channelId },
						{ kind: 'all', limit: 100 }
					)
			);

			// wasIdle만으로는 판별할 수 없다 — 추천곡 크로스페이드 중 유저 요청이면 enqueueTrack이
			// wasIdle:false를 돌려주면서도 곡을 맨 앞으로 잘라 즉시 재생(PLAY_NOW)하므로, 확정된
			// nowPlaying과 신청 곡을 직접 비교해 "지금 재생"인지 판별한다.
			const played = result.queued[0]!;
			const nowPlaying = nowPlayingTrack(result.player as CustomPlayer);
			const isPlayingNow = nowPlaying !== null && isSameTrack(nowPlaying, played);
			const queueSize = result.player.queue.tracks.length;
			return JSON.stringify({
				status: 'ok',
				action: isPlayingNow ? 'playing' : 'queued',
				track: trackInfo(played),
				queue_size: queueSize,
				queue_position: isPlayingNow ? null : Math.max(1, queueSize - result.queued.length + 1)
			});
		}
	};

	const musicPauseTool: AiTool = {
		name: 'music_pause',
		description: '현재 재생을 일시정지해요. 이미 일시정지 상태라면 재생을 이어 해요 (토글).',
		properties: {},
		required: [],
		status: '시루가 재생 상태를 바꾸는 중..',
		execute: async (_args, ctx) => {
			const actor = musicActor(ctx);
			// 토글 — 일시정지 중이면 재개, 아니면 일시정지. 인가·현재 곡 확인은 각 유스케이스가 맡아요.
			if (deps.getAudio()!.getPlayer(actor.guildId)?.paused) {
				await withAppError(() => deps.getMusic().resume(actor));
				return JSON.stringify({ status: 'resumed' });
			}
			await withAppError(() => deps.getMusic().pause(actor));
			return JSON.stringify({ status: 'paused' });
		}
	};

	const musicSkipTool: AiTool = {
		name: 'music_skip',
		description: '현재 재생 중인 곡을 건너뛰고 다음 곡을 재생해요. 대기열이 비어 있으면 현재 곡을 끝내요.',
		properties: {},
		required: [],
		status: '시루가 다음 곡으로 넘기는 중..',
		execute: async (_args, ctx) => {
			const actor = musicActor(ctx);
			// 인가·현재 곡 확인과 mixer 예열 슬롯 정리를 포함한 건너뛰기는 공용 유스케이스가 맡아요.
			await withAppError(() => deps.getMusic().skipNow(actor));
			const player = deps.getAudio()!.getPlayer(actor.guildId);
			const next = player ? nowPlayingTrack(player) : null;
			return JSON.stringify({ status: 'ok', now_playing: next ? trackInfo(next) : null });
		}
	};

	const musicStopTool: AiTool = {
		name: 'music_stop',
		description: '대기열을 비우고 재생을 중지한 뒤 음성 채널에서 봇이 나가요. 완전히 끄고 싶을 때만 쓰세요.',
		properties: {},
		required: [],
		status: '시루가 재생을 멈추고 퇴장하는 중..',
		execute: async (_args, ctx) => {
			// 인가·플레이어 확인·컨트롤러 삭제·정지는 공용 유스케이스가 맡아요.
			await withAppError(() => deps.getMusic().stop(musicActor(ctx)));
			return JSON.stringify({ status: 'stopped' });
		}
	};

	const musicQueueTool: AiTool = {
		name: 'music_queue',
		description: '현재 재생 중인 곡과 대기열(최대 15곡)을 확인해요. 사용자가 "무슨 노래 틀어줘 / 다음에 뭐야"라고 물으면 쓰세요.',
		properties: {},
		required: [],
		status: '시루가 대기열을 확인하는 중..',
		execute: async (_args, ctx) => {
			const guildId = requireGuild(ctx);
			const player = deps.getAudio()!.getPlayer(guildId);
			if (!player) throw new Error('현재 재생 중인 곡이 없어요.');
			const current = nowPlayingTrack(player);
			const upcoming = player.queue.tracks.slice(0, 15);
			return JSON.stringify({
				playing: current ? trackInfo(current) : null,
				paused: player.paused,
				queue_size: player.queue.tracks.length,
				upcoming: upcoming.map((track, index) => ({ position: index + 1, ...trackInfo(track) }))
			});
		}
	};

	function requireCustomPlayer(guildId: string): CustomPlayer {
		const player = deps.getAudio()!.getPlayer(guildId);
		if (!player) throw new Error('현재 재생 중인 곡이 없어요.');
		return player as CustomPlayer;
	}

	const musicVolumeTool: AiTool = {
		name: 'music_volume',
		description: '볼륨을 조회하거나 조절해요. volume을 주면 0~150으로 설정하고, 안 주면 현재 볼륨을 알려줘요.',
		properties: {
			volume: {
				type: 'integer',
				description: '설정할 볼륨 (0~150). 생략하면 현재 볼륨 조회'
			}
		},
		required: [],
		status: (args) => (args.volume === undefined || args.volume === null ? '시루가 볼륨을 확인하는 중..' : '시루가 볼륨을 조절하는 중..'),
		execute: async (args, ctx) => {
			const guildId = requireGuild(ctx);
			if (args.volume === undefined || args.volume === null) {
				const saved = await guildPlayback.getVolume(deps.guildService, guildId);
				return JSON.stringify({ status: 'ok', volume: saved });
			}
			// 인가·범위 검증·저장·플레이어 반영은 공용 유스케이스가 맡아요.
			const { volume: updated, playing } = await withAppError(() =>
				deps.getMusic().setVolume(musicActor(ctx), Math.round(Number(args.volume)))
			);
			return JSON.stringify({ status: 'ok', volume: updated, is_playing: playing });
		}
	};

	const musicSeekTool: AiTool = {
		name: 'music_seek',
		description: '현재 곡의 특정 시간으로 이동해요. time은 "90"(초), "1:30", "1:02:03" 형식이에요.',
		properties: {
			time: { type: 'string', description: '이동할 시간 (예: 90, 1:30)' }
		},
		required: ['time'],
		status: '시루가 곡을 이동하는 중..',
		execute: async (args, ctx) => {
			// 파싱 실패는 NaN으로 넘겨요 — 인가·스트림·형식·범위 검증은 공용 유스케이스가 맡아요.
			const ms = parseTimeToMs(String(args.time ?? '')) ?? Number.NaN;
			const { positionMs, track } = await withAppError(() => deps.getMusic().seek(musicActor(ctx), ms));
			return JSON.stringify({ status: 'ok', seeked_to_ms: positionMs, track: trackInfo(track) });
		}
	};

	const musicShuffleTool: AiTool = {
		name: 'music_shuffle',
		description: '대기열의 곡 순서를 랜덤으로 섞어요.',
		properties: {},
		required: [],
		status: '시루가 대기열을 섞는 중..',
		execute: async (_args, ctx) => {
			await requireDjOrAlone(ctx);
			const guildId = requireGuild(ctx);
			const player = requirePlayer(guildId);
			const queueLength = getUserQueuedTracks(player).length;
			if (queueLength === 0) throw new Error('섞을 대기열 곡이 없어요.');
			await removeStaleRelatedTracks(player);
			await player.queue.shuffle();
			void deps.mixerService.preloadUpcoming(player).catch(() => null);
			return JSON.stringify({ status: 'ok', queue_size: queueLength });
		}
	};

	const musicRepeatTool: AiTool = {
		name: 'music_repeat',
		description: '반복 모드를 설정하거나 조회해요. mode를 주면 설정하고, 안 주면 현재 모드를 알려줘요.',
		properties: {
			mode: { type: 'string', description: '반복 모드', enum: ['off', 'track', 'queue'] }
		},
		required: [],
		status: (args) => (args.mode === undefined || args.mode === null ? '시루가 반복 모드를 확인하는 중..' : '시루가 반복 모드를 바꾸는 중..'),
		execute: async (args, ctx) => {
			const guildId = requireGuild(ctx);
			const mode = args.mode === undefined || args.mode === null ? null : String(args.mode);
			if (mode === null) {
				const current = await guildPlayback.getRepeat(deps.guildService, guildId);
				return JSON.stringify({ status: 'ok', mode: current });
			}
			// 인가·값 검증·저장·플레이어 반영은 공용 유스케이스가 맡아요.
			const { mode: updated } = await withAppError(() => deps.getMusic().setRepeat(musicActor(ctx), mode));
			return JSON.stringify({ status: 'ok', mode: updated });
		}
	};

	const musicPreviousTool: AiTool = {
		name: 'music_previous',
		description: '이전에 재생한 곡을 다시 재생해요.',
		properties: {},
		required: [],
		status: '시루가 이전 곡으로 돌아가는 중..',
		execute: async (_args, ctx) => {
			// 인가·플레이어 확인·재생 기록 확인·이전곡 재생은 공용 유스케이스가 맡아요.
			const { track } = await withAppError(() => deps.getMusic().previous(musicActor(ctx)));
			return JSON.stringify({ status: 'ok', playing: trackInfo(track) });
		}
	};

	const musicRemoveTool: AiTool = {
		name: 'music_remove',
		description: '대기열에서 특정 위치의 곡을 삭제해요. position은 music_queue에서 확인한 1-based 번호예요.',
		properties: {
			position: { type: 'integer', description: '삭제할 곡의 대기열 번호 (1부터)' }
		},
		required: ['position'],
		status: '시루가 대기열에서 곡을 삭제하는 중..',
		execute: async (args, ctx) => {
			await requireDjOrAlone(ctx);
			const guildId = requireGuild(ctx);
			const player = requirePlayer(guildId);
			const position = Math.round(Number(args.position));
			const queueLength = getUserQueuedTracks(player).length;
			if (!Number.isFinite(position) || position < 1 || position > queueLength)
				throw new Error(`대기열 범위를 벗어났어요. 현재 대기열: ${queueLength}곡`);
			const removed = await player.queue.splice(position - 1, 1);
			const removedTracks = Array.isArray(removed) ? removed : [removed];
			if (removedTracks.length === 0) throw new Error('곡을 삭제할 수 없었어요.');
			void deps.mixerService.preloadUpcoming(player).catch(() => null);
			return JSON.stringify({ status: 'ok', removed: trackInfo(removedTracks[0]!) });
		}
	};

	const musicMoveTool: AiTool = {
		name: 'music_move',
		description: '대기열의 곡을 다른 위치로 옮겨요.',
		properties: {
			from: { type: 'integer', description: '현재 위치 (1부터)' },
			to: { type: 'integer', description: '옮길 목표 위치 (1부터)' }
		},
		required: ['from', 'to'],
		status: '시루가 대기열 순서를 바꾸는 중..',
		execute: async (args, ctx) => {
			await requireDjOrAlone(ctx);
			const guildId = requireGuild(ctx);
			const player = requirePlayer(guildId);
			const from = Math.round(Number(args.from));
			const to = Math.round(Number(args.to));
			const queueLength = getUserQueuedTracks(player).length;
			if (from < 1 || from > queueLength || to < 1 || to > queueLength)
				throw new Error(`대기열 범위를 벗어났어요. 현재 대기열: ${queueLength}곡`);
			if (from === to) throw new Error('같은 위치로는 이동할 수 없어요.');
			const [track] = await player.queue.splice(from - 1, 1);
			if (!track) throw new Error('곡을 이동할 수 없었어요.');
			await player.queue.splice(to - 1, 0, track);
			void deps.mixerService.preloadUpcoming(player).catch(() => null);
			return JSON.stringify({ status: 'ok', moved: trackInfo(track), from, to });
		}
	};

	const musicFilterTool: AiTool = {
		name: 'music_filter',
		description: '오디오 필터 프리셋을 켜거나 꺼요. 같은 프리셋을 또 보내면 꺼지고(토글), reset이면 모든 필터를 초기화해요.',
		properties: {
			preset: {
				type: 'string',
				description: '필터 프리셋',
				// 선택지 목록은 프리셋 카탈로그에서 뽑는다 — 스키마 enum과 검증기가 갈라지지 않게
				enum: [...FILTER_PRESET_NAMES, 'reset']
			}
		},
		required: ['preset'],
		status: '시루가 음질 필터를 적용하는 중..',
		execute: async (args, ctx) => {
			await requireDjOrAlone(ctx);
			const player = requireCustomPlayer(requireGuild(ctx));
			const preset = String(args.preset ?? '');
			if (!isFilterPreset(preset) && preset !== 'reset') throw new Error('알 수 없는 필터 프리셋이에요.');

			await resetAllFilters(player);

			if (preset === 'reset') {
				player.activeFilters = [];
				return JSON.stringify({ status: 'ok', active_filters: [] });
			}

			const active = player.activeFilters ?? [];
			const willEnable = !active.includes(preset);
			const newFilters = willEnable ? [...active, preset] : active.filter((f) => f !== preset);
			for (const f of newFilters) await applyFilterPreset(player, f);
			player.activeFilters = dropLoserFilters(newFilters);
			return JSON.stringify({ status: 'ok', preset, enabled: willEnable, active_filters: player.activeFilters });
		}
	};

	const musicLyricsTool: AiTool = {
		name: 'music_lyrics',
		description: '곡 가사를 찾아줘요. query를 안 주면 현재 재생 중인 곡의 가사를 찾아요.',
		properties: {
			query: { type: 'string', description: '가사 검색어 (곡 제목/아티스트). 생략 시 현재 재생 곡' }
		},
		required: [],
		status: '시루가 가사를 찾는 중..',
		execute: async (args, ctx) => {
			let query = String(args.query ?? '').trim();
			if (!query) {
				const player = deps.getAudio()!.getPlayer(requireGuild(ctx));
				const current = player?.queue.current;
				if (!current) throw new Error('검색어를 입력하거나 곡을 재생 중이어야 해요.');
				query = `${current.info.author} ${current.info.title}`.replace(/\(.*?\)|\[.*?\]/g, '').trim();
			}
			const results = await searchLyrics(query).catch(() => {
				throw new Error('가사를 검색하는 중 오류가 발생했어요.');
			});
			if (!results.length || (!results[0]!.plainLyrics && !results[0]!.syncedLyrics))
				throw new Error(`**${query}**에 대한 가사를 찾을 수 없었어요.`);
			const result = results[0]!;
			let lyrics = (result.plainLyrics ?? result.syncedLyrics ?? '').replace(/\[\d{2}:\d{2}\.\d{2,3}\]\s*/g, '');
			if (lyrics.length > 1500) lyrics = `${lyrics.slice(0, 1500)}\n\n*... (가사가 길어 잘렸어요)*`;
			return JSON.stringify({ status: 'ok', track: result.trackName, artist: result.artistName, lyrics });
		}
	};

	const musicHistoryTool: AiTool = {
		name: 'music_history',
		description: '이 서버의 최근 재생 기록을 보여줘요.',
		properties: {
			limit: { type: 'integer', description: '가져올 개수 (1~15, 기본 10)' }
		},
		required: [],
		status: '시루가 재생 기록을 확인하는 중..',
		execute: async (args, ctx) => {
			const guildId = requireGuild(ctx);
			const rawLimit = args.limit === undefined || args.limit === null ? 10 : Math.round(Number(args.limit));
			const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 15) : 10;
			const history = await deps.db.guildTrackHistory.findMany({
				where: { guildId },
				orderBy: { createdAt: 'desc' },
				take: limit,
				include: { track: true }
			});
			if (history.length === 0) return JSON.stringify({ status: 'ok', items: [] });
			return JSON.stringify({
				status: 'ok',
				items: history.map((h) => ({
					played_at: h.createdAt.toISOString(),
					title: h.track.title,
					artist: h.track.artist,
					url: h.track.url,
					requested_by: h.userId
				}))
			});
		}
	};

	const musicPlaylistTool: AiTool = {
		name: 'music_playlist',
		description: '내 보관함의 플레이리스트를 재생해요. 이름으로 찾고, 최대 100곡까지 대기열에 넣어요.',
		properties: {
			name: { type: 'string', description: '플레이리스트 이름' }
		},
		required: ['name'],
		status: '시루가 플레이리스트를 재생하는 중..',
		execute: async (args, ctx) => {
			const { guildId, voiceChannelId } = requireVoice(ctx);
			const name = String(args.name ?? '').trim();
			if (!name) throw new Error('플레이리스트 이름이 필요해요.');

			const { playlist, tracks } = await deps.playlistService.getPlaylistTracks(ctx.userId, name);
			if (tracks.length === 0) throw new Error(`**${playlist.name}** 플레이리스트가 비어있어요.`);

			const player = await deps.audioService.getOrCreatePlayer(guildId, voiceChannelId, ctx.channelId);
			await deps.audioService.connectPlayer(player);

			let added = 0;
			const batchTracks = tracks.slice(0, 100);
			const CONCURRENCY = 5;
			for (let i = 0; i < batchTracks.length; i += CONCURRENCY) {
				const batch = batchTracks.slice(i, i + CONCURRENCY);
				const results = await Promise.allSettled(
					batch.map((t) =>
						deps.audioService.search(player, t.track.url, PLATFORM_MAP[String(t.track.source)] ?? 'ytsearch', {
							id: ctx.userId,
							username: ctx.username
						})
					)
				);
				for (const result of results) {
					if (result.status === 'fulfilled' && result.value.tracks.length > 0) {
						await deps.audioService.enqueueTrack(player, result.value.tracks[0]);
						added++;
					}
				}
			}
			if (added === 0) throw new Error('플레이리스트 곡을 대기열에 추가하지 못했어요.');
			await deps.audioService.ensurePlayback(player);
			return JSON.stringify({ status: 'ok', playlist: playlist.name, added });
		}
	};

	return [
		musicPlayTool,
		musicPauseTool,
		musicSkipTool,
		musicStopTool,
		musicQueueTool,
		musicVolumeTool,
		musicSeekTool,
		musicShuffleTool,
		musicRepeatTool,
		musicPreviousTool,
		musicRemoveTool,
		musicMoveTool,
		musicFilterTool,
		musicLyricsTool,
		musicHistoryTool,
		musicPlaylistTool
	];
}
