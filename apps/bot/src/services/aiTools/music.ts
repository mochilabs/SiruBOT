import { container } from '@sapphire/framework';
import type { RepeatMode, SearchPlatform } from 'lavalink-client';
import { getUserQueuedTracks, removeStaleRelatedTracks } from '../../modules/audio/lavalink/autoPlayRelated.ts';
import type { CustomPlayer } from '../../modules/audio/lavalink/player/customPlayer.ts';
import type { AiTool, AiToolContext } from './types.ts';
import { searchLyrics } from '../dataApiClient.ts';

const PLATFORM_MAP: Record<string, SearchPlatform> = {
	youtube: 'ytsearch',
	spotify: 'spsearch',
	soundcloud: 'scsearch'
};

type EnqueueableTrack = Parameters<typeof container.audioService.enqueueTrack>[1];

function requireGuild(ctx: AiToolContext): string {
	if (!ctx.guildId) throw new Error('서버 채널에서만 음악을 사용할 수 있어요.');
	return ctx.guildId;
}

function requireVoice(ctx: AiToolContext): { guildId: string; voiceChannelId: string } {
	const guildId = requireGuild(ctx);
	if (!ctx.voiceChannelId) throw new Error('먼저 음성 채널에 접속해 주세요.');
	return { guildId, voiceChannelId: ctx.voiceChannelId };
}

function requirePlayer(guildId: string) {
	const player = container.audio.getPlayer(guildId);
	if (!player) throw new Error('현재 재생 중인 곡이 없어요.');
	return player;
}

function trackInfo(track: { info: { title?: string; author?: string; duration?: number } }) {
	return { title: track.info.title ?? '(제목 미상)', author: track.info.author ?? '', length_ms: track.info.duration ?? 0 };
}

const musicPlayTool: AiTool = {
	name: 'music_play',
	description:
		'음성 채널에서 음악을 재생해요. 사용자가 음성 채널에 접속해 있어야 해요. 제목·아티스트·URL을 검색어로 넘기세요. 플레이리스트 결과는 앞 100곡까지 대기열에 넣어요. source: youtube(기본)|spotify|soundcloud.',
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
		const { guildId, voiceChannelId } = requireVoice(ctx);
		const query = String(args.query ?? '').trim();
		if (!query) throw new Error('검색어가 필요해요.');
		const sourceKey = String(args.source ?? 'youtube');
		const platform = PLATFORM_MAP[sourceKey] ?? 'ytsearch';

		const player = await container.audioService.getOrCreatePlayer(guildId, voiceChannelId, ctx.channelId);
		const errorContext = { command: 'music_play', query, platform, voiceChannelId, textChannelId: ctx.channelId, guildId };
		const searchRes = await container.audioService.search(player, query, platform, { id: ctx.userId, username: ctx.username }, errorContext);
		await container.audioService.connectPlayer(player, errorContext);

		let tracks: EnqueueableTrack[];
		if (searchRes.loadType === 'track' || searchRes.loadType === 'search' || searchRes.loadType === 'playlist') tracks = searchRes.tracks;
		else tracks = [];

		if (tracks.length === 0) throw new Error('검색 결과가 없어요. 다른 검색어로 시도해 주세요.');

		const limit = searchRes.loadType === 'playlist' ? 100 : 1;
		for (const track of tracks.slice(0, limit)) {
			await container.audioService.enqueueTrack(player, track);
		}
		await container.audioService.ensurePlayback(player);

		const current = player.queue.current;
		return JSON.stringify({
			status: 'ok',
			playing: current ? trackInfo(current) : { title: query, author: '', length_ms: 0 },
			queued: Math.max(tracks.length - 1, 0)
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
		const guildId = requireGuild(ctx);
		const player = requirePlayer(guildId);
		if (player.paused) {
			await player.resume();
			return JSON.stringify({ status: 'resumed' });
		}
		await player.pause();
		return JSON.stringify({ status: 'paused' });
	}
};

const musicSkipTool: AiTool = {
	name: 'music_skip',
	description: '현재 재생 중인 곡을 건너뛰고 다음 곡을 재생해요.',
	properties: {},
	required: [],
	status: '시루가 다음 곡으로 넘기는 중..',
	execute: async (_args, ctx) => {
		const guildId = requireGuild(ctx);
		const player = requirePlayer(guildId);
		if (!player.queue.current) throw new Error('건너뛸 곡이 없어요.');
		// /스킵 커맨드와 동일한 경로 — 스킵 전 mixer 예열 슬롯을 비워야
		// stale 슬롯 관망(trackEnd consumePreloaded)으로 무음/공백이 생기지 않는다.
		await container.mixerService.skip(player);
		const next = player.queue.current;
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
		const guildId = requireGuild(ctx);
		const player = requirePlayer(guildId);
		player.setData('stopByCommand', true);
		await container.mixerService.clearNext(player).catch(() => null);
		await player.stopPlaying();
		await player.disconnect();
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
		const player = container.audio.getPlayer(guildId);
		if (!player) throw new Error('현재 재생 중인 곡이 없어요.');
		const current = player.queue.current;
		const upcoming = player.queue.tracks.slice(0, 15);
		return JSON.stringify({
			playing: current ? trackInfo(current) : null,
			paused: player.paused,
			queue_size: player.queue.tracks.length,
			upcoming: upcoming.map((track, index) => ({ position: index + 1, ...trackInfo(track) }))
		});
	}
};

// ── 재생 제어 확장 툴 ────────────────────────────────────────────────

function requireCustomPlayer(guildId: string): CustomPlayer {
	const player = container.audio.getPlayer(guildId);
	if (!player) throw new Error('현재 재생 중인 곡이 없어요.');
	return player as CustomPlayer;
}

function parseSeekMs(input: string): number | null {
	const trimmed = String(input).trim();
	if (trimmed.includes(':')) {
		const parts = trimmed.split(':').map(Number);
		if (parts.some(Number.isNaN)) return null;
		if (parts.length === 2) return (parts[0]! * 60 + parts[1]!) * 1000;
		if (parts.length === 3) return (parts[0]! * 3600 + parts[1]! * 60 + parts[2]!) * 1000;
		return null;
	}
	const seconds = Number(trimmed);
	if (Number.isNaN(seconds)) return null;
	return seconds * 1000;
}

async function applyPresetOnce(player: CustomPlayer, preset: string) {
	switch (preset) {
		case 'bassboost':
			await player.filterManager.setEQ([
				{ band: 0, gain: 0.6 },
				{ band: 1, gain: 0.7 },
				{ band: 2, gain: 0.8 },
				{ band: 3, gain: 0.55 },
				{ band: 4, gain: 0.25 }
			]);
			break;
		case 'nightcore':
			await player.filterManager.toggleNightcore(1.3, 1.3, 1);
			break;
		case 'vaporwave':
			await player.filterManager.toggleVaporwave(0.8, 0.8, 1);
			break;
		case '8d':
			await player.filterManager.toggleRotation(0.2);
			break;
		case 'karaoke':
			await player.filterManager.toggleKaraoke(1.0, 1.0, 220, 100);
			break;
	}
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
			const saved = await container.guildService.getVolume(guildId);
			return JSON.stringify({ status: 'ok', volume: saved });
		}
		const volume = Math.round(Number(args.volume));
		if (!Number.isFinite(volume) || volume < 0 || volume > 150) throw new Error('볼륨은 0~150 사이로 설정할 수 있어요.');
		const { volume: updated } = await container.guildService.updateVolume(guildId, volume);
		const player = container.audio.getPlayer(guildId);
		if (player) player.setVolume(updated);
		return JSON.stringify({ status: 'ok', volume: updated, is_playing: !!player });
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
		const player = requirePlayer(requireGuild(ctx));
		const current = player.queue.current;
		if (!current) throw new Error('현재 재생 중인 곡이 없어요.');
		if (current.info.isStream) throw new Error('실시간 스트리밍에서는 이동할 수 없어요.');
		const ms = parseSeekMs(String(args.time ?? ''));
		if (ms === null || ms < 0) throw new Error('시간 형식이 잘못됐어요. (예: 90, 1:30)');
		if (ms > current.info.duration) throw new Error('곡의 길이를 초과하는 시간이에요.');
		await player.seek(ms);
		return JSON.stringify({ status: 'ok', seeked_to_ms: ms, track: trackInfo(current) });
	}
};

const musicShuffleTool: AiTool = {
	name: 'music_shuffle',
	description: '대기열의 곡 순서를 랜덤으로 섞어요.',
	properties: {},
	required: [],
	status: '시루가 대기열을 섞는 중..',
	execute: async (_args, ctx) => {
		const guildId = requireGuild(ctx);
		const player = requirePlayer(guildId);
		const queueLength = getUserQueuedTracks(player).length;
		if (queueLength === 0) throw new Error('섞을 대기열 곡이 없어요.');
		await removeStaleRelatedTracks(player);
		await player.queue.shuffle();
		void container.mixerService.preloadUpcoming(player).catch(() => null);
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
			const current = await container.guildService.getRepeat(guildId);
			return JSON.stringify({ status: 'ok', mode: current });
		}
		if (!['off', 'track', 'queue'].includes(mode)) throw new Error('반복 모드는 off/track/queue 중 하나예요.');
		const updated = await container.guildService.setRepeat(guildId, mode as RepeatMode);
		const player = container.audio.getPlayer(guildId);
		await player?.setRepeatMode(updated);
		if (player && updated !== 'off') await container.mixerService.clearNext(player).catch(() => null);
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
		const player = requireCustomPlayer(requireGuild(ctx));
		if (player.queue.previous.length === 0) throw new Error('이전에 재생한 곡이 없어요.');
		const previousTrack = player.queue.previous[player.queue.previous.length - 1];
		if (player.queue.current) player.queue.tracks.unshift(player.queue.current);
		await container.mixerService.clearNext(player).catch(() => null);
		await container.mixerService.primeForPlay(player);
		await player.play({ clientTrack: previousTrack });
		player.queue.previous.pop();
		return JSON.stringify({ status: 'ok', playing: trackInfo(previousTrack) });
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
		const guildId = requireGuild(ctx);
		const player = requirePlayer(guildId);
		const position = Math.round(Number(args.position));
		const queueLength = getUserQueuedTracks(player).length;
		if (!Number.isFinite(position) || position < 1 || position > queueLength)
			throw new Error(`대기열 범위를 벗어났어요. 현재 대기열: ${queueLength}곡`);
		const removed = await player.queue.splice(position - 1, 1);
		const removedTracks = Array.isArray(removed) ? removed : [removed];
		if (removedTracks.length === 0) throw new Error('곡을 삭제할 수 없었어요.');
		void container.mixerService.preloadUpcoming(player).catch(() => null);
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
		const guildId = requireGuild(ctx);
		const player = requirePlayer(guildId);
		const from = Math.round(Number(args.from));
		const to = Math.round(Number(args.to));
		const queueLength = getUserQueuedTracks(player).length;
		if (from < 1 || from > queueLength || to < 1 || to > queueLength) throw new Error(`대기열 범위를 벗어났어요. 현재 대기열: ${queueLength}곡`);
		if (from === to) throw new Error('같은 위치로는 이동할 수 없어요.');
		const [track] = await player.queue.splice(from - 1, 1);
		if (!track) throw new Error('곡을 이동할 수 없었어요.');
		await player.queue.splice(to - 1, 0, track);
		void container.mixerService.preloadUpcoming(player).catch(() => null);
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
			enum: ['bassboost', 'nightcore', 'vaporwave', '8d', 'karaoke', 'reset']
		}
	},
	required: ['preset'],
	status: '시루가 음질 필터를 적용하는 중..',
	execute: async (args, ctx) => {
		const player = requireCustomPlayer(requireGuild(ctx));
		const preset = String(args.preset ?? '');
		if (!['bassboost', 'nightcore', 'vaporwave', '8d', 'karaoke', 'reset'].includes(preset)) throw new Error('알 수 없는 필터 프리셋이에요.');

		await player.filterManager.resetFilters();
		await player.filterManager.clearEQ();
		await container.mixerService.reapplyMixerFilter(player);

		if (preset === 'reset') {
			player.activeFilters = [];
			return JSON.stringify({ status: 'ok', active_filters: [] });
		}

		const active = player.activeFilters ?? [];
		const willEnable = !active.includes(preset);
		const newFilters = willEnable ? [...active, preset] : active.filter((f) => f !== preset);
		for (const f of newFilters) await applyPresetOnce(player, f);
		player.activeFilters = newFilters;
		return JSON.stringify({ status: 'ok', preset, enabled: willEnable, active_filters: newFilters });
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
			const player = container.audio.getPlayer(requireGuild(ctx));
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
		const history = await container.db.guildTrackHistory.findMany({
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

const musicTtsTool: AiTool = {
	name: 'music_tts',
	description: '현재 재생 중인 음성을 일시적으로 깔고 텍스트를 음성으로 들려줘요. 짧은 안내 문구에 써요.',
	properties: {
		text: { type: 'string', description: '음성으로 읽을 내용 (200자 이하, 한국어)' }
	},
	required: ['text'],
	status: '시루가 음성으로 읽어주는 중..',
	execute: async (args, ctx) => {
		const guildId = requireGuild(ctx);
		const player = requirePlayer(guildId);
		const text = String(args.text ?? '').trim();
		if (!text) throw new Error('읽을 내용이 필요해요.');
		if (text.length > 200) throw new Error('음성 안내는 200자까지 가능해요.');
		const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&tl=ko&q=${encodeURIComponent(text)}`;
		try {
			await container.mixerService.announce(player, ttsUrl, 0.2);
		} catch {
			throw new Error('다른 음성 효과가 진행 중이거나 재생하지 못했어요. 잠시 후 다시 시도해 주세요.');
		}
		return JSON.stringify({ status: 'ok', speaking: text });
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

		const { playlist, tracks } = await container.playlistService.getPlaylistTracks(ctx.userId, name);
		if (tracks.length === 0) throw new Error(`**${playlist.name}** 플레이리스트가 비어있어요.`);

		const player = await container.audioService.getOrCreatePlayer(guildId, voiceChannelId, ctx.channelId);
		const errorContext = { command: 'music_playlist', query: name, platform: 'ytsearch', voiceChannelId, textChannelId: ctx.channelId, guildId };
		await container.audioService.connectPlayer(player, errorContext);

		let added = 0;
		const batchTracks = tracks.slice(0, 100);
		const CONCURRENCY = 5;
		for (let i = 0; i < batchTracks.length; i += CONCURRENCY) {
			const batch = batchTracks.slice(i, i + CONCURRENCY);
			const results = await Promise.allSettled(
				batch.map((t) =>
					container.audioService.search(
						player,
						t.track.url,
						PLATFORM_MAP[String(t.track.source)] ?? 'ytsearch',
						{ id: ctx.userId, username: ctx.username },
						errorContext
					)
				)
			);
			for (const result of results) {
				if (result.status === 'fulfilled' && result.value.tracks.length > 0) {
					await container.audioService.enqueueTrack(player, result.value.tracks[0]);
					added++;
				}
			}
		}
		if (added === 0) throw new Error('플레이리스트 곡을 대기열에 추가하지 못했어요.');
		await container.audioService.ensurePlayback(player);
		return JSON.stringify({ status: 'ok', playlist: playlist.name, added });
	}
};

export const musicTools: AiTool[] = [
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
	musicTtsTool,
	musicPlaylistTool
];
