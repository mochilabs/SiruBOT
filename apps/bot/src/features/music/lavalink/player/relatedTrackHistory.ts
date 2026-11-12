import type { Track, UnresolvedTrack } from 'lavalink-client';
import { isYouTubeSource } from '@sirubot/utils';
import { z } from 'zod';

const savedHistorySchema = z.array(z.string());

function normalizeMetadata(value: string): string {
	return value
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

function trackKeys(track: Track | UnresolvedTrack): string[] {
	const info = track.info;
	const keys: string[] = [];
	if (info.identifier) {
		const source = isYouTubeSource(info.sourceName) ? 'youtube' : (info.sourceName ?? '');
		keys.push(JSON.stringify(['id', source, info.identifier]));
	}
	const isrc = info.isrc?.toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (isrc) keys.push(JSON.stringify(['isrc', isrc]));
	if (info.title && info.author && info.duration && info.duration > 0) {
		// Keep artist/title separators and version labels; strip only upload presentation labels.
		const title = normalizeMetadata(
			info.title
				.toLowerCase()
				.replace(/[\[(](?:official(?:\s+music)?\s+(?:video|audio)|official\s+mv|lyrics?|가사|m\/?v|audio|hd|4k)[\])]/gu, ' ')
		);
		const author = normalizeMetadata(info.author.toLowerCase().replace(/\s*-\s*topic$/u, ''));
		if (title && author) keys.push(JSON.stringify(['recording', author, title, Math.round(info.duration / 1000)]));
	}
	return keys;
}

/** Session history is independent of the queue's bounded back-navigation history. */
export class RelatedTrackHistory {
	private readonly played = new Set<string>();

	public remember(track: Track | UnresolvedTrack): void {
		for (const key of trackKeys(track)) this.played.add(key);
	}

	public has(track: Track | UnresolvedTrack): boolean {
		return trackKeys(track).some((key) => this.played.has(key));
	}

	public restore(value: unknown): void {
		const result = savedHistorySchema.safeParse(value);
		if (result.success) {
			for (const key of result.data) this.played.add(key);
		}
	}

	public toJSON(): string[] {
		return [...this.played];
	}
}
