import { container } from '@sapphire/framework';

export interface YouTubeChapter {
	name: string;
	start: number;
	end: number;
	duration: number;
}

/** 장문 영상에서만 챕터가 의미 있으므로 이 미만은 조회하지 않는다. */
export const CHAPTER_FETCH_MIN_DURATION_MS = 5 * 60 * 1000;
const CACHE_TTL_MS = 30 * 60 * 1000;
/** 챕터가 없다는 결론은 일시적 조회 실패와 구분할 수 없으므로 짧게 캐시해 재시도한다. */
const EMPTY_CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const cache = new Map<string, { chapters: YouTubeChapter[]; at: number; ttl: number }>();

const WEB_CONTEXT = {
	context: { client: { clientName: 'WEB', clientVersion: '2.20220502.01.00', hl: 'ko', gl: 'KR' } }
};

/** `0:00` / `1:02:03` 형태를 ms로 변환한다. */
function parseTimestamp(value: string): number | null {
	const parts = String(value)
		.trim()
		.split(':')
		.map((part) => Number(part.trim()));
	if (parts.length < 2 || parts.length > 3) return null;
	if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
	return parts.reduce((acc, part) => acc * 60 + part, 0) * 1000;
}

function joinText(node: unknown): string {
	const block = node as { runs?: { text?: string }[]; simpleText?: string } | null;
	if (!block) return '';
	if (Array.isArray(block.runs)) return block.runs.map((run) => run.text ?? '').join('');
	return block.simpleText ?? '';
}

/** 임의 깊이의 JSON에서 특정 키 값을 모두 수집한다. */
function findNodes(value: unknown, key: string, found: unknown[] = []): unknown[] {
	if (!value || typeof value !== 'object') return found;
	if (Array.isArray(value)) {
		for (const item of value) findNodes(item, key, found);
		return found;
	}
	for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
		if (entryKey === key) found.push(entryValue);
		findNodes(entryValue, key, found);
	}
	return found;
}

/** 시작 시각·제목이 쌍을 이룬 원시 항목을 정렬·중복 제거하고 끝 시각을 계산한다. */
function toChapters(raw: { name: string; startMs: number }[], durationMs: number): YouTubeChapter[] {
	const unique = new Map<string, { name: string; startMs: number }>();
	for (const item of raw) {
		if (!item.name || !Number.isFinite(item.startMs) || item.startMs < 0) continue;
		const key = `${item.startMs}|${item.name}`;
		if (!unique.has(key)) unique.set(key, item);
	}

	const sorted = [...unique.values()].sort((a, b) => a.startMs - b.startMs);
	// 챕터가 1개뿐이면 구간을 나눌 수 없어 표시하지 않는다.
	if (sorted.length < 2) return [];

	const chapters: YouTubeChapter[] = [];
	for (let index = 0; index < sorted.length; index++) {
		const current = sorted[index];
		const end = index + 1 < sorted.length ? sorted[index + 1].startMs : durationMs;
		if (end <= current.startMs) continue;
		chapters.push({ name: current.name, start: current.startMs, end, duration: end - current.startMs });
	}
	return chapters;
}

/** 검색 결과 카드의 `expandableMetadata`에서 챕터를 읽는다 (SponsorBlock 플러그인과 동일 경로). */
async function fetchFromSearch(videoId: string, durationMs: number): Promise<YouTubeChapter[]> {
	const response = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
		method: 'POST',
		headers: { 'content-type': 'application/json', referer: 'https://www.youtube.com' },
		body: JSON.stringify({ ...WEB_CONTEXT, query: videoId })
	});
	if (!response.ok) return [];

	const payload = await response.json();
	const video = findNodes(payload, 'videoRenderer').find((node) => (node as { videoId?: string })?.videoId === videoId);
	const cards = (
		video as
			| {
					expandableMetadata?: {
						expandableMetadataRenderer?: {
							expandedContent?: { horizontalCardListRenderer?: { cards?: Record<string, unknown>[] } };
						};
					};
			  }
			| undefined
	)?.expandableMetadata?.expandableMetadataRenderer?.expandedContent?.horizontalCardListRenderer?.cards;
	if (!Array.isArray(cards) || cards.length === 0) return [];

	const raw = cards
		.map((card) => card.macroMarkersListItemRenderer as { title?: unknown; timeDescription?: unknown } | undefined)
		.filter((item): item is NonNullable<typeof item> => Boolean(item))
		.map((item) => ({ name: joinText(item.title), startMs: parseTimestamp(joinText(item.timeDescription)) ?? Number.NaN }));

	return toChapters(raw, durationMs);
}

/** 시청 페이지의 `ytInitialData`에서 챕터를 읽는다 (검색 결과에 카드가 없을 때 폴백). */
async function fetchFromWatchPage(videoId: string, durationMs: number): Promise<YouTubeChapter[]> {
	const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: { 'user-agent': USER_AGENT } });
	if (!response.ok) return [];

	const html = await response.text();
	const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
	if (!match) return [];

	let payload: unknown;
	try {
		payload = JSON.parse(match[1]);
	} catch {
		return [];
	}

	const raw = findNodes(payload, 'macroMarkersListItemRenderer')
		.map((node) => node as { title?: unknown; timeDescription?: unknown })
		.filter((item) => item && (item.title || item.timeDescription))
		.map((item) => ({ name: joinText(item.title), startMs: parseTimestamp(joinText(item.timeDescription)) ?? Number.NaN }));

	return toChapters(raw, durationMs);
}

/**
 * YouTube 영상의 챕터(에피소드)를 조회한다.
 * 검색 카드 → 시청 페이지 순으로 시도하며, 결과는 videoId 단위로 캐시한다.
 * 실패하거나 챕터가 없으면 빈 배열을 반환한다.
 */
export async function fetchYouTubeChapters(videoId: string, durationMs: number): Promise<YouTubeChapter[]> {
	if (!videoId || durationMs <= 0) return [];

	const cached = cache.get(videoId);
	if (cached && Date.now() - cached.at < cached.ttl) return cached.chapters;

	let chapters: YouTubeChapter[] = [];
	try {
		chapters = await fetchFromSearch(videoId, durationMs);
	} catch (error) {
		container.logger.debug(`[chapters] search lookup failed for ${videoId}: ${error}`);
	}

	if (chapters.length === 0) {
		try {
			chapters = await fetchFromWatchPage(videoId, durationMs);
		} catch (error) {
			container.logger.debug(`[chapters] watch page lookup failed for ${videoId}: ${error}`);
		}
	}

	if (cache.size >= CACHE_MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	cache.set(videoId, { chapters, at: Date.now(), ttl: chapters.length > 0 ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS });
	return chapters;
}

/** 트랙에서 YouTube videoId를 얻는다. YouTube 소스의 identifier가 곧 videoId다. */
export function resolveYouTubeVideoId(track: { info?: { sourceName?: string; identifier?: string } } | null | undefined): string | null {
	if (!track?.info || track.info.sourceName !== 'youtube') return null;
	const identifier = track.info.identifier;
	return identifier && identifier.length > 0 ? identifier : null;
}
