import { SPONSORBLOCK_SKIP_CATEGORIES, type SponsorBlockSkipSegment } from '@sirubot/utils';
import { z } from 'zod';

const upstreamSegmentSchema = z.object({
	category: z.enum(SPONSORBLOCK_SKIP_CATEGORIES),
	actionType: z.literal('skip'),
	segment: z.tuple([z.number().finite(), z.number().finite()])
});
const upstreamSegmentsSchema = z.array(upstreamSegmentSchema).max(2_000);
export const sponsorBlockSegmentsSchema = z
	.array(z.object({ category: z.enum(SPONSORBLOCK_SKIP_CATEGORIES), startMs: z.number().int().nonnegative(), endMs: z.number().int().positive() }))
	.max(2_000);

const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_SEGMENT_END_MS = 24 * 60 * 60 * 1_000;

async function readBounded(response: Response): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) throw new Error('SponsorBlock response has no body');
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_RESPONSE_BYTES) {
			await reader.cancel();
			throw new Error('SponsorBlock response is too large');
		}
		chunks.push(value);
	}
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(result);
}

export async function fetchSponsorBlockSegmentsFresh(videoId: string): Promise<SponsorBlockSkipSegment[]> {
	const url = new URL('https://sponsor.ajay.app/api/skipSegments');
	url.searchParams.set('videoID', videoId);
	url.searchParams.set('categories', JSON.stringify(SPONSORBLOCK_SKIP_CATEGORIES));
	url.searchParams.set('actionType', 'skip');
	let response: Response;
	try {
		response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { accept: 'application/json' } });
	} catch {
		throw new Error('SponsorBlock request failed');
	}
	if (response.status === 404) return [];
	if (!response.ok) throw new Error(`SponsorBlock returned HTTP ${response.status}`);
	let raw: unknown;
	try {
		raw = JSON.parse(await readBounded(response));
	} catch {
		throw new Error('SponsorBlock response could not be read');
	}
	const parsed = upstreamSegmentsSchema.safeParse(raw);
	if (!parsed.success) throw new Error('SponsorBlock returned invalid segments');
	return parsed.data.flatMap(({ category, segment: [start, end] }) => {
		const startMs = Math.round(start * 1_000);
		const endMs = Math.round(end * 1_000);
		return startMs >= 0 && startMs < endMs && endMs <= MAX_SEGMENT_END_MS ? [{ category, startMs, endMs }] : [];
	});
}

export function sponsorBlockCacheKey(videoId: string): string {
	return `dataapi:v2:sponsorblock:${videoId}`;
}
