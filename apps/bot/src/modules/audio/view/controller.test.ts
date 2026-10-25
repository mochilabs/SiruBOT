import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emoji } from '@sirubot/utils';
import type { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { controllerView } from './controller.ts';
import { repeatEmoji } from './repeat.ts';

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
	content?: string;
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

	it('대기열이 있어도 대기열 보기 행을 추가하지 않는다', () => {
		mocks.queued.mockReturnValue([TRACK]);
		const rows = actionRows(controllerJson());

		expectValidActionRows(rows);
		expect(rows).toHaveLength(1);
		expect(rows.flat().some((button) => button.custom_id === 'controller:queue:show')).toBe(false);
	});

	it('챕터가 있으면 챕터 행을 추가한다', () => {
		mocks.chapterIndex.mockReturnValue(0);
		const rows = actionRows(controllerJson({ player: player({ chapters: CHAPTERS }) }));

		expectValidActionRows(rows);
		expect(rows).toHaveLength(2);
		expect(rows[1]!.map((button) => button.custom_id)).toEqual(['controller:chapter:prev', 'controller:chapter:next']);
	});

	it('챕터와 대기열이 있어도 챕터 행만 만든다', () => {
		mocks.queued.mockReturnValue([TRACK]);
		mocks.chapterIndex.mockReturnValue(0);
		const rows = actionRows(controllerJson({ player: player({ chapters: CHAPTERS }) }));

		expectValidActionRows(rows);
		expect(rows).toHaveLength(2);
		expect(rows[1]!.map((button) => button.custom_id)).toEqual(['controller:chapter:prev', 'controller:chapter:next']);
	});

	it('카드 모드에서도 ActionRow 길이 제약을 지킨다', () => {
		const rows = actionRows(controllerJson({ nowPlayingCardUrl: 'attachment://card.png' }));

		expectValidActionRows(rows);
		expect(rows).toHaveLength(1);
	});
});

describe('controllerView 라벨·타이틀', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.queued.mockReturnValue([]);
		mocks.remaining.mockReturnValue(0);
		mocks.nowPlaying.mockReturnValue(TRACK);
		mocks.chapter.mockReturnValue(null);
		mocks.chapterIndex.mockReturnValue(null);
	});

	it('재생 라벨은 상태와 음성 채널 멘션을 표시한다', () => {
		const texts = collectTexts(controllerJson());
		expect(texts.some((text) => text.includes('재생 중 <#voice-channel>'))).toBe(true);
		expect(texts.some((text) => text.includes('에서 재생 중'))).toBe(false);
		expect(texts.some((text) => text.includes('🔊 <#'))).toBe(false);
		expect(texts.some((text) => text.includes('<#text-channel>'))).toBe(false);
	});

	it('일시정지하면 라벨 상태가 일시정지로 바뀐다', () => {
		const texts = collectTexts(controllerJson({ player: player({ paused: true }) }));
		expect(texts.some((text) => text.includes('일시정지 <#voice-channel>'))).toBe(true);
		expect(texts.some((text) => text.includes('재생 중 <#voice-channel>'))).toBe(false);
		// 일시정지 중에도 현재 위치는 계속 보여준다
		expect(texts.some((text) => text.includes('(00:30 / 03:00)'))).toBe(true);
	});

	it('스트리밍이면 라벨 상태가 실시간이 된다', () => {
		const streamTrack = { ...TRACK, info: { ...TRACK.info, isStream: true, duration: 0 } };
		mocks.nowPlaying.mockReturnValue(streamTrack);
		const texts = collectTexts(controllerJson({ player: player({ queue: { current: streamTrack, previous: [], tracks: [] } }) }));
		expect(texts.some((text) => text.includes('실시간 <#voice-channel>'))).toBe(true);
		expect(texts.some((text) => text.includes('라이브'))).toBe(true);
	});

	it('보이스 채널을 알 수 없으면 재생 라벨을 붙이지 않는다', () => {
		const texts = collectTexts(controllerJson({ player: player({ voiceChannelId: undefined }) }));
		expect(texts.some((text) => text.includes('<#') && text.includes('재생 중'))).toBe(false);
		expect(texts.some((text) => text.includes('(00:30 / 03:00)'))).toBe(true);
	});

	it('아티스트 줄은 이모지와 괄호 없이 아티스트 이름만 표시한다', () => {
		const texts = collectTexts(controllerJson());
		expect(texts.some((text) => text.includes('💿 아티스트'))).toBe(true);
		expect(texts.some((text) => text.includes('(아티스트)'))).toBe(false);
	});

	it('신청자는 footer 맨 마지막에 아이콘과 함께 표시한다', () => {
		const texts = collectTexts(controllerJson());
		const footer = texts.find((text) => text.startsWith('-# ') && text.includes('<@user-1>'));
		expect(footer).toBeDefined();
		expect(footer).toContain('50%');
		expect(footer?.trimEnd().endsWith('<@user-1>')).toBe(true);
		expect(footer).toContain(emoji('user'));
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

	it('진행바를 재생 시간 앞에 배치한다', () => {
		const texts = collectTexts(controllerJson());
		// 시작/끝 셀 패딩 폴백(공백)이 진행바 좌우에 붙는다 — 30초/180초 → ' ■□□□□ '
		expect(texts.some((text) => text.includes(' ■□□□□  (00:30 / 03:00)') || text.includes(' ■□□□□ (00:30 / 03:00)'))).toBe(true);
	});

	it('대기열이 없으면 divider를 렌더하지 않는다', () => {
		const json = controllerJson();
		expect((json.components ?? []).some((component) => component.type === 14)).toBe(false);
	});

	it('대기열 요약은 divider 다음 컨텐츠보다 먼저 나타난다', () => {
		mocks.queued.mockReturnValue([TRACK]);
		mocks.remaining.mockReturnValue(60_000);

		const components = controllerJson().components ?? [];
		const summaryIndex = components.findIndex((component) => component.type === 10 && component.content?.includes('대기열 1곡 (1분 남음)'));
		const dividerIndex = components.findIndex((component) => component.type === 14);
		const texts = collectTexts(controllerJson());
		const footer = texts.find((text) => text.startsWith('-# ') && text.includes('50%'));

		expect(summaryIndex).toBeGreaterThanOrEqual(0);
		expect(dividerIndex).toBe(summaryIndex + 1);
		expect(footer).toBeDefined();
		expect(footer).not.toContain('대기열');
	});

	it('track-repeat off 아이콘은 slash가 포함된 별도 앱 이모지를 사용한다', () => {
		const json = controllerJson();
		const repeatButton = actionRows(json)[0]![4] as unknown as Record<string, unknown>;
		expect(repeatButton.emoji).toEqual({ name: repeatEmoji('off'), animated: false });
	});
});

describe('controllerView 챕터(에피소드) 줄', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.queued.mockReturnValue([]);
		mocks.remaining.mockReturnValue(0);
		mocks.nowPlaying.mockReturnValue(TRACK);
		mocks.chapter.mockReturnValue(null);
		mocks.chapterIndex.mockReturnValue(null);
	});

	it('챕터가 00:00부터 시작하면 시각 범위만 보여준다', () => {
		mocks.chapter.mockReturnValue({ name: '1화', start: 0, end: 234_000, duration: 234_000 });

		const texts = collectTexts(controllerJson());

		expect(texts.some((text) => text.includes('🎬 1화 (00:00~03:54)'))).toBe(true);
		expect(texts.some((text) => text.includes('(03:54)'))).toBe(false);
	});

	it('챕터 구간을 이모지와 괄호로 표시한다', () => {
		mocks.chapter.mockReturnValue({ name: '1화', start: 0, end: 60_000, duration: 60_000 });
		const texts = collectTexts(controllerJson());
		expect(texts.some((text) => text.includes('🎬 1화 (00:00~01:00)'))).toBe(true);
	});

	it('영상 중간부터 시작하는 챕터도 길이 표기 없이 시각 범위만 보여준다', () => {
		mocks.chapter.mockReturnValue({ name: '2화', start: 60_000, end: 120_000, duration: 60_000 });

		const texts = collectTexts(controllerJson());

		expect(texts.some((text) => text.includes('🎬 2화 (01:00~02:00)'))).toBe(true);
		expect(texts.some((text) => text.includes('(01:00)'))).toBe(false);
	});
});
