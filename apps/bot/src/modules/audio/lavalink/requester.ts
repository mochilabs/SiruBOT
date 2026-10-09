/**
 * track.requester 공용 파서 — 봇이 요청자를 user 객체로 넣어요 (related_track은 추천 곡 센티널).
 * nowPlayingCard / playerStatePublisher가 함께 써요.
 */
import { container } from '@sapphire/framework';
import type { CustomPlayer } from './player/customPlayer.ts';
import type { Track } from 'lavalink-client';

/** requester 객체에서 userId를 뽑아요 — 문자열/related_track/비객체는 null */
export function requesterIdOf(track: Track | undefined | null): string | null {
	const requester = track?.requester;
	const id = requester && typeof requester === 'object' ? (requester as Record<string, unknown>).id : undefined;
	if (typeof id !== 'string' || !id || id === 'related_track') return null;
	return id;
}

/** userId로 길드 멤버 캐시에서 displayName을 찾아요 (비동기 fetch 없이 캐시만) */
export function resolveRequesterName(player: CustomPlayer, requesterId: string | null): string | null {
	if (!requesterId) return null;
	const member = container.client.guilds.cache.get(player.guildId)?.members.cache.get(requesterId);
	return member?.displayName ?? null;
}
