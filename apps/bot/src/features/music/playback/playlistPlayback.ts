import { UserError } from '@sapphire/framework';
import type { GuildMember, User } from 'discord.js';
import type { LavalinkManager, Track } from 'lavalink-client';
import type { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { lookupSource } from '../discord/utils/source.ts';
import * as guildChannels from '../../../services/guildSettings/channels.ts';
import type { AudioService } from './audioService.ts';
import type { GuildService } from '../../../services/guildService.ts';

type SavedTrack = { track: { title: string; url: string; source: string } };
export type PlaylistPlaybackContext = { guildId: string; channelId: string; member: GuildMember; user: User };

export interface PlaylistPlaybackDeps {
	guildService: GuildService;
	audioService: AudioService;
	/** audio는 setupAudio 뒤에 생겨서 호출 시점에 읽어요 */
	getAudio: () => LavalinkManager<CustomPlayer>;
}

export type PlaylistPlayback = ReturnType<typeof createPlaylistPlayback>;

/** 저장한 목록 재생 — BotApplication.setupServices가 한 번 만들어 container.playlistPlayback으로 노출해요. */
export function createPlaylistPlayback(deps: PlaylistPlaybackDeps) {
	return { playSavedTracks: (context: PlaylistPlaybackContext, tracks: SavedTrack[]) => playSavedTracks(deps, context, tracks) };
}

async function playSavedTracks(deps: PlaylistPlaybackDeps, context: PlaylistPlaybackContext, tracks: SavedTrack[]): Promise<string> {
	const deny = (message: string): never => {
		throw new UserError({ identifier: 'playlist_play', message, context: { ephemeral: true } });
	};
	const checkVoice = () => {
		const voice = context.member.voice;
		if (!voice.channelId) return deny('먼저 음성 채널에 들어가 주세요. 목록 관리는 음성 입장 없이도 할 수 있어요.');
		const existing = deps.getAudio().getPlayer(context.guildId);
		if (existing?.voiceChannelId && existing.voiceChannelId !== voice.channelId) return deny('봇과 같은 음성 채널에서 재생해 주세요.');
		if (voice.deaf) return deny('헤드셋 음소거를 해제한 뒤 재생해 주세요.');
		return voice.channelId;
	};
	const voiceChannelId = checkVoice();
	const textChannel = await guildChannels.getDefaultTextChannel(deps.guildService, context.guildId);
	if (textChannel && textChannel !== context.channelId) return deny(`재생은 <#${textChannel}>에서 실행해 주세요.`);
	if (!tracks.length) return deny('목록이 비어 있어요. 먼저 곡을 추가해 주세요.');
	const node = deps.getAudio().nodeManager.leastUsedNodes('players')[0];
	if (!node) return deny('지금 음악 서버에 연결할 수 없어요. 목록은 그대로 유지돼요.');
	const resolved: Track[] = [];
	const failed: string[] = [];
	for (let start = 0; start < tracks.length; start += 5) {
		const batch = tracks.slice(start, start + 5);
		const results = await Promise.allSettled(
			batch.map(({ track }) => node.search({ query: track.url, source: lookupSource(track.source) }, context.user))
		);
		for (const [index, result] of results.entries()) {
			const track = result.status === 'fulfilled' ? result.value.tracks[0] : undefined;
			if (track) resolved.push(track);
			else failed.push(batch[index]!.track.title);
		}
	}
	if (!resolved.length)
		return deny(`${tracks.length}곡을 모두 불러오지 못했어요. 대기열에는 아무 곡도 추가하지 않았어요. 잠시 후 다시 시도해 주세요.`);
	if (checkVoice() !== voiceChannelId) return deny('음성 채널이 바뀌었어요. 현재 채널에서 다시 실행해 주세요.');
	const player = await deps.audioService.getOrCreatePlayer(context.guildId, voiceChannelId, context.channelId);
	await deps.audioService.connectPlayer(player, { guildId: context.guildId, voiceChannelId, textChannelId: context.channelId });
	if (checkVoice() !== voiceChannelId) return deny('음성 채널이 바뀌었어요. 현재 채널에서 다시 실행해 주세요.');
	await deps.audioService.enqueueTrack(player, resolved);
	const summary = `**${tracks.length}곡 중 ${resolved.length}곡**을 대기열에 추가했어요.${
		failed.length
			? `\n불러오지 못한 곡 ${failed.length}개: ${failed
					.slice(0, 3)
					.map((title) => title.slice(0, 60))
					.join(', ')}${failed.length > 3 ? ' 외' : ''}`
			: ''
	}`;
	if (player.paused) return `${summary}\n현재 일시정지 상태를 유지했어요. /음악 재개로 이어서 들을 수 있어요.`;
	try {
		await deps.audioService.ensurePlayback(player);
	} catch {
		return `${summary}\n재생 시작에 실패했어요. 곡은 이미 추가됐으니 전체 목록을 다시 추가하지 말고 /음악 재개를 실행해 주세요.`;
	}
	return summary;
}
