/**
 * track.requester 공용 파서 — 봇이 요청자를 user 객체로 넣어요 (related_track은 추천 곡 센티널).
 * playerStatePublisher / autoPlayRelated / controller 등이 함께 써요.
 */
import { container } from '@sapphire/framework';
import type { CustomPlayer } from './player/customPlayer.ts';
import type { Track } from 'lavalink-client';

/** 자동 추천곡 센티널 — requester.id로 흐르는 값. 오타 리터럴 재발을 막으려면 이 상수만 사용. */
export const RELATED_TRACK_REQUESTER_ID = 'related_track';

/** 채팅 TTS 클립 센티널 — 사람이 신청한 곡이 아니므로 히스토리·신청자 표시 대상이 아니다. */
export const TTS_CLIP_REQUESTER_ID = 'chat_tts_clip';

/** 트랙이 채팅 TTS 클립인지 — requester 센티널로 판별한다 (명세 4.2 단독 클립 규칙). */
export function isTtsClip(track: Track | { requester?: unknown } | undefined | null): boolean {
	const requester = track?.requester;
	const id = requester && typeof requester === 'object' ? (requester as Record<string, unknown>).id : undefined;
	return id === TTS_CLIP_REQUESTER_ID;
}

/** requester 객체에서 userId를 뽑아요 — 문자열/센티널(related_track, chat_tts_clip)/비객체는 null */
export function requesterIdOf(track: Track | undefined | null): string | null {
	const requester = track?.requester;
	const id = requester && typeof requester === 'object' ? (requester as Record<string, unknown>).id : undefined;
	if (typeof id !== 'string' || !id || id === RELATED_TRACK_REQUESTER_ID || id === TTS_CLIP_REQUESTER_ID) return null;
	return id;
}

/** userId로 길드 멤버 캐시에서 displayName을 찾아요 (비동기 fetch 없이 캐시만) */
export function resolveRequesterName(player: CustomPlayer, requesterId: string | null): string | null {
	if (!requesterId) return null;
	const member = container.client.guilds.cache.get(player.guildId)?.members.cache.get(requesterId);
	return member?.displayName ?? null;
}
