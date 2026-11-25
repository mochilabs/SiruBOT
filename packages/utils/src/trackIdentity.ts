// Autoplay dedup, chart grouping and ISRC matching share these rules; change them only here or the chart and autoplay disagree on what counts as the same track.

export function normalizeMetadata(value: string): string {
	return value
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

export function normalizeIsrc(raw: string | null | undefined): string | null {
	const value = raw?.toUpperCase().replace(/[^A-Z0-9]/g, '');
	return value && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(value) ? value : null;
}

// Only upload decoration is stripped; version markers (Remix, Live, Acoustic, Inst., Sped up) are different recordings and stay.
const UPLOAD_LABEL =
	/[\[(【](?:official(?:\s+music)?\s+(?:video|audio)|official\s+(?:mv|m\/v|visualizer|lyric\s+video)|music\s+video|lyrics?(?:\s+video)?|가사|m\/?v|audio|hd|4k|visualizer)[\])】]/giu;

export function normalizeTitle(title: string): string {
	return normalizeMetadata(title.replace(UPLOAD_LABEL, ' '));
}

export function normalizeArtist(author: string): string {
	return normalizeMetadata(
		author
			.replace(/\s*-\s*topic$/iu, '')
			.replace(/vevo$/iu, '')
			.replace(/\s+official$/iu, '')
	);
}

const SEPARATOR = /\s+[-–—]\s+/u;

/** YouTube sources only: splitting Spotify's `Song - Remastered 2011` would be wrong. */
export function splitArtistFromTitle(title: string, uploader: string): { artist: string; title: string } {
	const parts = title.split(SEPARATOR);
	if (parts.length < 2) return { artist: uploader, title };
	const left = parts[0]!.trim();
	const right = parts.slice(1).join(' - ').trim();
	if (!left || !right) return { artist: uploader, title };
	return { artist: left, title: right };
}

/** Display values: only upload decoration and uploader suffixes are removed; case and symbols stay. */
export function displayMetadata(input: { title: string; author: string; sourceName?: string | null }): { title: string; artist: string } {
	const split = input.sourceName?.startsWith('youtube')
		? splitArtistFromTitle(input.title, input.author)
		: { artist: input.author, title: input.title };
	const title = split.title.replace(UPLOAD_LABEL, ' ').replace(/\s+/g, ' ').trim();
	const artist = split.artist
		.replace(/\s*-\s*topic$/iu, '')
		.replace(/vevo$/iu, '')
		.trim();
	return { title: title || input.title, artist: artist || input.author };
}

export interface TrackIdentityInput {
	title?: string | null;
	author?: string | null;
	durationMs?: number | null;
	isrc?: string | null;
	sourceName?: string | null;
}

export interface TrackIdentity {
	isrc: string | null;
	artist: string;
	title: string;
	/** Duration is excluded; compare it with durationMatches. */
	recordingKey: string | null;
	durationMs: number;
}

export function recordingKey(artist: string, title: string): string | null {
	return artist && title ? `rec:${artist}|${title}` : null;
}

export function trackIdentity(input: TrackIdentityInput): TrackIdentity {
	const rawTitle = input.title?.trim() ?? '';
	const rawAuthor = input.author?.trim() ?? '';
	const split = input.sourceName?.startsWith('youtube') ? splitArtistFromTitle(rawTitle, rawAuthor) : { artist: rawAuthor, title: rawTitle };
	const artist = normalizeArtist(split.artist);
	const title = normalizeTitle(split.title);
	return {
		isrc: normalizeIsrc(input.isrc),
		artist,
		title,
		recordingKey: recordingKey(artist, title),
		durationMs: input.durationMs && input.durationMs > 0 ? input.durationMs : 0
	};
}

/** False when either duration is unknown. */
export function durationMatches(a: number, b: number, toleranceMs = 3_000): boolean {
	return a > 0 && b > 0 && Math.abs(a - b) <= toleranceMs;
}

/** Higher means a more official catalog. */
export function sourcePriority(source: string | null | undefined): number {
	const s = source?.toLowerCase() ?? '';
	if (s.startsWith('spotify') || s.startsWith('applemusic') || s.startsWith('deezer')) return 3;
	if (s.startsWith('youtubemusic') || s === 'ytmsearch') return 2;
	if (s.startsWith('youtube')) return 1;
	return 0;
}

/** Per guild, per track, per day in period charts. */
export const CHART_GUILD_DAILY_PLAY_CAP = 5;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** For Postgres DATE columns. */
export function kstDay(at: Date = new Date()): Date {
	const shifted = new Date(at.getTime() + KST_OFFSET_MS);
	return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}
