/**
 * 같은 녹음(recording) 판별 규칙 — 봇 자동재생 중복 방지와 인기 차트 묶음, ISRC 조회 매칭이 같이 써요.
 * 규칙이 갈라지면 "차트에선 같은 곡인데 자동재생은 또 튼다" 같은 어긋남이 생기니 여기서만 고쳐요.
 * 순수 모듈이라 클라이언트 번들에서도 쓸 수 있어요.
 */

/** NFKC, 소문자, 문자·숫자 이외는 공백 하나로. */
export function normalizeMetadata(value: string): string {
	return value
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

/** ISRC는 영숫자 12자예요. 형식이 아니면 null. */
export function normalizeIsrc(raw: string | null | undefined): string | null {
	const value = raw?.toUpperCase().replace(/[^A-Z0-9]/g, '');
	return value && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(value) ? value : null;
}

// 업로드 표기만 지워요. Remix·Live·Acoustic·Inst.·Sped up 같은 버전 표기는 다른 녹음이라 남겨요.
const UPLOAD_LABEL =
	/[\[(【](?:official(?:\s+music)?\s+(?:video|audio)|official\s+(?:mv|m\/v|visualizer|lyric\s+video)|music\s+video|lyrics?(?:\s+video)?|가사|m\/?v|audio|hd|4k|visualizer)[\])】]/giu;

/** 제목에서 업로드 표기를 지우고 정규화해요. */
export function normalizeTitle(title: string): string {
	return normalizeMetadata(title.replace(UPLOAD_LABEL, ' '));
}

/** 업로더 접미사(`- Topic`, `VEVO`, `Official`)를 지우고 정규화해요. */
export function normalizeArtist(author: string): string {
	return normalizeMetadata(
		author
			.replace(/\s*-\s*topic$/iu, '')
			.replace(/vevo$/iu, '')
			.replace(/\s+official$/iu, '')
	);
}

const SEPARATOR = /\s+[-–—]\s+/u;

/**
 * YouTube 비공식 업로드의 `아티스트 - 제목`을 나눠요. YouTube 소스에만 써요
 * (Spotify 제목의 `Song - Remastered 2011`을 잘못 나누지 않게).
 */
export function splitArtistFromTitle(title: string, uploader: string): { artist: string; title: string } {
	const parts = title.split(SEPARATOR);
	if (parts.length < 2) return { artist: uploader, title };
	const left = parts[0]!.trim();
	const right = parts.slice(1).join(' - ').trim();
	if (!left || !right) return { artist: uploader, title };
	return { artist: left, title: right };
}

/**
 * 화면에 보일 제목·아티스트 — 업로드 표기와 업로더 접미사만 지우고 대소문자·기호는 그대로 둬요.
 * YouTube 업로드는 `아티스트 - 제목`을 나눠요.
 */
export function displayMetadata(input: { title: string; author: string; sourceName?: string | null }): { title: string; artist: string } {
	const split = input.sourceName?.startsWith('youtube') ? splitArtistFromTitle(input.title, input.author) : { artist: input.author, title: input.title };
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
	/** 정규화된 아티스트·제목. 비어 있으면 녹음 키를 만들 수 없어요. */
	artist: string;
	title: string;
	/** `rec:<artist>|<title>` — 길이는 넣지 않고 durationMatches로 따로 비교해요. */
	recordingKey: string | null;
	durationMs: number;
}

export function recordingKey(artist: string, title: string): string | null {
	return artist && title ? `rec:${artist}|${title}` : null;
}

/** 차트 묶음·ISRC 매칭용 정체성. YouTube 업로드는 `아티스트 - 제목`을 나눠요. */
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

/** 길이 차이가 허용 오차 이내인지 (기본 ±3초). 한쪽이라도 길이를 모르면 false. */
export function durationMatches(a: number, b: number, toleranceMs = 3_000): boolean {
	return a > 0 && b > 0 && Math.abs(a - b) <= toleranceMs;
}

/** 대표 표시값(제목·아티스트·썸네일)을 고를 때의 소스 우선순위. 클수록 정식 카탈로그예요. */
export function sourcePriority(source: string | null | undefined): number {
	const s = source?.toLowerCase() ?? '';
	if (s.startsWith('spotify') || s.startsWith('applemusic') || s.startsWith('deezer')) return 3;
	if (s.startsWith('youtubemusic') || s === 'ytmsearch') return 2;
	if (s.startsWith('youtube')) return 1;
	return 0;
}

/** 기간 차트에서 한 서버가 한 곡으로 하루에 올릴 수 있는 최대 재생 수 */
export const CHART_GUILD_DAILY_PLAY_CAP = 5;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 날짜를 UTC 자정 Date로 (Postgres DATE 컬럼 값). */
export function kstDay(at: Date = new Date()): Date {
	const shifted = new Date(at.getTime() + KST_OFFSET_MS);
	return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}
