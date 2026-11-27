import type { CustomPlayer } from './player/customPlayer.ts';
import type { LavalinkDeps } from './deps.ts';
import type { Track } from 'lavalink-client';

export const RELATED_TRACK_REQUESTER_ID = 'related_track';

export const TTS_CLIP_REQUESTER_ID = 'chat_tts_clip';

export function isTtsClip(track: Track | { requester?: unknown } | undefined | null): boolean {
	const requester = track?.requester;
	const id = requester && typeof requester === 'object' ? (requester as Record<string, unknown>).id : undefined;
	return id === TTS_CLIP_REQUESTER_ID;
}

export function requesterIdOf(track: Track | undefined | null): string | null {
	const requester = track?.requester;
	const id = requester && typeof requester === 'object' ? (requester as Record<string, unknown>).id : undefined;
	if (typeof id !== 'string' || !id || id === RELATED_TRACK_REQUESTER_ID || id === TTS_CLIP_REQUESTER_ID) return null;
	return id;
}

export function resolveRequesterName(deps: LavalinkDeps, player: CustomPlayer, requesterId: string | null): string | null {
	if (!requesterId) return null;
	const member = deps.client.guilds.cache.get(player.guildId)?.members.cache.get(requesterId);
	return member?.displayName ?? null;
}
