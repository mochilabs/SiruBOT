import type { SearchPlatform } from 'lavalink-client';

/**
 * 트랙 source(youtube/spotify/soundcloud) → Lavalink 검색 플랫폼 매핑.
 * favorites/playlist 등 여러 명령어에서 공용으로 쓰여요.
 */
export const SOURCE_MAP = { youtube: 'ytsearch', spotify: 'spsearch', soundcloud: 'scsearch' } as const;

export function lookupSource(source: string): SearchPlatform {
	return SOURCE_MAP[source as keyof typeof SOURCE_MAP] ?? 'ytsearch';
}
