import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { controllerView } from './controller.ts';

const mocks = vi.hoisted(() => ({ queued: vi.fn(), remaining: vi.fn(), nowPlaying: vi.fn(), chapter: vi.fn(), chapterIndex: vi.fn() }));

vi.mock('../lavalink/player/customPlayer.ts', () => ({ CustomPlayer: class CustomPlayer {} }));
vi.mock('../lavalink/autoPlayRelated.ts', () => ({ getUserQueuedTracks: mocks.queued, remainingUntilQueueEnd: mocks.remaining }));
vi.mock('../lavalink/player/nowPlaying.ts', () => ({ nowPlayingTrack: mocks.nowPlaying }));
vi.mock('../lavalink/player/chapters.ts', () => ({ currentChapter: mocks.chapter, currentChapterIndex: mocks.chapterIndex }));
vi.mock('../lavalink/requester.ts', () => ({ RELATED_TRACK_REQUESTER_ID: 'related_track', TTS_CLIP_REQUESTER_ID: 'chat_tts_clip' }));

const TRACK = {
	info: {
		title: '테스트 곡',
		author: '아티스트',
		duration: 180_000,
		isStream: false,
		uri: 'https://example.com/track',
		artworkUrl: 'https://example.com/art.jpg'
	},
	requester: { id: 'user-1' }
};

const CHAPTERS = [{ name: '1장', start: 0, end: 60_000 }];

interface PlainComponent {
	type: number;
	custom_id?: string;
	components?: PlainComponent[];
}

function player(overrides: Record<string, unknown> = {}): CustomPlayer {
	return {
		paused: false,
		position: 30_000,
		volume: 50,
		repeatMode: 'off',
		chapters: [],
		node: { id: 'node-1' },
		voiceChannelId: 'voice-channel',
		queue: { current: TRACK, previous: [], tracks: [] },
		...overrides
	} as unknown as CustomPlayer;
}

/** 컨테이너 직계 자식 중 ActionRow만 꺼낸다. */
function actionRows(json: PlainComponent): PlainComponent[][] {
	return (json.components ?? []).filter((component) => component.type === 1).map((row) => row.components ?? []);
}

function controllerJson(options: { player?: CustomPlayer; nowPlayingCardUrl?: string } = {}): PlainComponent {
	return controllerView({
		player: options.player ?? player(),
		volume: 50,
		nowPlayingCardUrl: options.nowPlayingCardUrl
	}).toJSON() as unknown as PlainComponent;
}

/** 컨테이너 전체를 돌며 TextDisplay content를 모은다 (섹션 내부 포함). */
function collectTexts(component: unknown): string[] {
	if (!component || typeof component !== 'object') return [];
	const node = component as Record<string, unknown>;
	const texts: string[] = [];
	if (typeof node.content === 'string') texts.push(node.content);
	for (const child of (node.components as unknown[] | undefined) ?? []) texts.push(...collectTexts(child));
	return texts;
}

/** Discord는 ActionRow당 버튼 1~5개만 허용한다 (BASE_TYPE_BAD_LENGTH). */
function expectValidActionRows(rows: PlainComponent[][]): void {
	for (const row of rows) {
		expect(row.length).toBeGreaterThanOrEqual(1);
		expect(row.length).toBeLessThanOrEqual(5);
	}
}

describe('controllerView action rows', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.queued.mockReturnValue([]);
		mocks.remaining.mockReturnValue(0);
		mocks.nowPlaying.mockReturnValue(TRACK);
		mocks.chapter.mockReturnValue(null);
		mocks.chapterIndex.mockReturnValue(null);
	});

	it('대기열도 챕터도 없으면 빈 ActionRow를 보내지 않는다', () => {
		const rows = actionRows(controllerJson());

		expectValidActionRows(rows);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toHaveLength(5);
	});

	it('대기열이 있으면 대기열 보기 행을 추가한다', () => {
		mocks.queued.mockReturnValue([TRACK]);
		const rows = actionRows(controllerJson());

		expectValidActionRows(rows);
		expect(rows).toHaveLength(2);
		expect(rows[1]!.map((button) => button.custom_id)).toEqual(['controller:queue:show']);
	});

	it('챕터가 있으면 챕터 행을 추가한다', () => {
		mocks.chapterIndex.mockReturnValue(0);
		const rows = actionRows(controllerJson({ player: player({ chapters: CHAPTERS }) }));

		expectValidActionRows(rows);
		expect(rows).toHaveLength(2);
		expect(rows[1]!.map((button) => button.custom_id)).toEqual(['controller:chapter:prev', 'controller:chapter:next']);
	});

	it('챕터와 대기열이 모두 있으면 각각 행을 만든다', () => {
		mocks.queued.mockReturnValue([TRACK]);
		mocks.chapterIndex.mockReturnValue(0);
		const rows = actionRows(controllerJson({ player: player({ chapters: CHAPTERS }) }));

		expectValidActionRows(rows);
		expect(rows).toHaveLength(3);
		expect(rows[2]!.map((button) => button.custom_id)).toEqual(['controller:queue:show']);
	});

	it('카드 모드에서도 ActionRow 길이 제약을 지킨다', () => {
		const rows = actionRows(controllerJson({ nowPlayingCardUrl: 'attachment://card.png' }));

		expectValidActionRows(rows);
		expect(rows).toHaveLength(1);
	});
});

describe('controllerView 재생 라벨·타이틀', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.queued.mockReturnValue([]);
		mocks.remaining.mockReturnValue(0);
		mocks.nowPlaying.mockReturnValue(TRACK);
		mocks.chapter.mockReturnValue(null);
		mocks.chapterIndex.mockReturnValue(null);
	});

	it('재생 중 라벨은 텍스트 채널이 아니라 보이스 채널을 멘션한다', () => {
		const texts = collectTexts(controllerJson());

		expect(texts.some((text) => text.includes('<#voice-channel>에서 재생 중'))).toBe(true);
		expect(texts.some((text) => text.includes('<#text-channel>'))).toBe(false);
	});

	it('보이스 채널을 알 수 없으면 재생 중 라벨을 붙이지 않는다', () => {
		const texts = collectTexts(controllerJson({ player: player({ voiceChannelId: undefined }) }));

		expect(texts.some((text) => text.includes('에서 재생 중'))).toBe(false);
	});

	it('짧은 URL이면 타이틀에 원본 링크를 건다', () => {
		const texts = collectTexts(controllerJson());

		expect(texts.some((text) => text.includes(`### **[테스트 곡](https://example.com/track)**`))).toBe(true);
	});

	it('URL이 너무 길면 타이틀 링크를 걸지 않는다', () => {
		const longUri = `https://example.com/${'a'.repeat(80)}`;
		mocks.nowPlaying.mockReturnValue({ ...TRACK, info: { ...TRACK.info, uri: longUri } });

		const texts = collectTexts(controllerJson());

		expect(texts.some((text) => text.includes(`### **테스트 곡**`))).toBe(true);
		expect(texts.some((text) => text.includes(longUri))).toBe(false);
	});
});
