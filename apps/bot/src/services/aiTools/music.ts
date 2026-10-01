import { container } from '@sapphire/framework';
import type { SearchPlatform } from 'lavalink-client';
import type { AiTool, AiToolContext } from './types.ts';

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
	execute: async (_args, ctx) => {
		const guildId = requireGuild(ctx);
		const player = requirePlayer(guildId);
		if (!player.queue.current) throw new Error('건너뛸 곡이 없어요.');
		await player.skip();
		const next = player.queue.current;
		return JSON.stringify({ status: 'ok', now_playing: next ? trackInfo(next) : null });
	}
};

const musicStopTool: AiTool = {
	name: 'music_stop',
	description: '대기열을 비우고 재생을 중지한 뒤 음성 채널에서 봇이 나가요. 완전히 끄고 싶을 때만 쓰세요.',
	properties: {},
	required: [],
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

export const musicTools: AiTool[] = [musicPlayTool, musicPauseTool, musicSkipTool, musicStopTool, musicQueueTool];
