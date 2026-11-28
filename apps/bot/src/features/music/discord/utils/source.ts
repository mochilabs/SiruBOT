import type { SearchPlatform } from 'lavalink-client';

const SOURCE_MAP = { youtube: 'ytsearch', spotify: 'spsearch', soundcloud: 'scsearch' } as const;

export function lookupSource(source: string): SearchPlatform {
	return SOURCE_MAP[source as keyof typeof SOURCE_MAP] ?? 'ytsearch';
}
