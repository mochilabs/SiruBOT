import { z } from 'zod';

const trackSchema = z.object({
	info: z
		.object({
			identifier: z.string().optional(),
			title: z.string().optional(),
			author: z.string().optional(),
			length: z.number().optional(),
			artworkUrl: z.string().nullable().optional(),
			uri: z.string().nullable().optional()
		})
		.passthrough()
});

const loadTracksSchema = z.object({
	loadType: z.string(),
	data: z.union([z.array(trackSchema), z.object({ tracks: z.array(trackSchema) })]).nullable()
});

export interface YoutubeSearchTrack {
	id: string;
	title: string;
	artist: string;
	duration: number;
	thumbnail: string | null;
	url: string;
	source: 'youtube';
}

export async function searchLavalinkYoutube(restUrl: string, password: string, query: string): Promise<YoutubeSearchTrack[]> {
	const base = new URL(restUrl);
	const endpoint = new URL(`${base.pathname.replace(/\/+$/, '')}/v4/loadtracks`, base);
	endpoint.searchParams.set('identifier', `ytsearch:${query}`);

	const response = await fetch(endpoint, {
		headers: { Authorization: password },
		signal: AbortSignal.timeout(8_000)
	});
	if (!response.ok) throw new Error(`Lavalink REST returned ${response.status}`);

	const parsed = loadTracksSchema.safeParse(await response.json());
	if (!parsed.success || parsed.data.loadType === 'error') throw new Error('Lavalink returned an invalid search result');
	if (!parsed.data.data || parsed.data.loadType === 'empty') return [];

	const tracks = Array.isArray(parsed.data.data) ? parsed.data.data : parsed.data.data.tracks;
	return tracks.slice(0, 8).flatMap(({ info }) => {
		const id = info.identifier?.trim();
		if (!id) return [];
		return [
			{
				id,
				title: info.title?.trim() || '제목 없음',
				artist: info.author?.trim() || '아티스트 없음',
				duration: info.length ?? 0,
				thumbnail: info.artworkUrl ?? null,
				url: info.uri || `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
				source: 'youtube' as const
			}
		];
	});
}
