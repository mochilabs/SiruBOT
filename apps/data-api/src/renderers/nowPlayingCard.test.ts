import { describe, expect, it } from 'vitest';
import { renderNowPlayingCard } from './nowPlayingCard.ts';

/** NowPlaying 카드 렌더 스모크 — 정적 카드(진행바 없음) 크기/타이틀/브랜드를 검증해요. */

function fullInput() {
	return {
		trackId: 'jNQXAC9IVRw',
		title: 'Rick Astley - Never Gonna Give You Up',
		artist: 'Rick Astley',
		artworkUrl: null,
		positionMs: 92_000,
		durationMs: 213_000,
		isStream: false,
		isPaused: false,
		repeatMode: 'queue' as const,
		isRecommended: false,
		nextTracks: [
			{ title: '다음 곡 하나', artist: '아티스트' },
			{ title: '다음 곡 둘', artist: null }
		],
		queueCount: 27,
		queueRemainingMs: 81 * 60_000,
		volume: 80,
		nodeId: 'main',
		brandLine: '시루봇 4.2.1 (8a2f6c1)',
		chapter: null,
		requester: null,
		trackUrl: null
	};
}

function expectPngSize(buffer: Buffer, width: number, height: number): void {
	expect([buffer[0], buffer[1], buffer[2], buffer[3]]).toEqual([137, 80, 78, 71]);
	// IHDR — PNG 헤더의 너비/높이는 각각 16/20 바이트 오프셋 big-endian
	expect(buffer.readUInt32BE(16)).toBe(width);
	expect(buffer.readUInt32BE(20)).toBe(height);
}

const luma = ([r, g, b]: number[]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

describe('renderNowPlayingCard', () => {
	it('renders a 960x400 PNG', async () => {
		const buffer = await renderNowPlayingCard(fullInput());
		expectPngSize(buffer, 960, 400);
		expect(buffer.length).toBeGreaterThan(1_000);
	});

	it('renders the title and brand on the card', async () => {
		const buffer = await renderNowPlayingCard(fullInput());
		const { loadImage, Canvas } = await import('skia-canvas');
		const img = await loadImage(buffer);
		const canvas = new Canvas(960, 400);
		const ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0);
		// 제목은 썸네일(28+320+28=376) 오른쪽, 상단 112px 기준선에 흰색으로 그려져요.
		// 단일 픽셀은 안티앨리어싱 때문에 회색일 수 있어 40×40 영역 평균 밝기로 검증한다.
		const titleRegion = ctx.getImageData(380, 75, 40, 40);
		const titleLumas = Array.from({ length: titleRegion.data.length / 4 }, (_, i) =>
			luma([titleRegion.data[i * 4]!, titleRegion.data[i * 4 + 1]!, titleRegion.data[i * 4 + 2]!])
		);
		const avgTitleLuma = titleLumas.reduce((a, b) => a + b, 0) / titleLumas.length;
		expect(avgTitleLuma).toBeGreaterThan(0.25);
		// 브랜드는 좌측 하단(baseline H-22=378)에 액센트 색으로 그려져요.
		// 대기열 메타는 그 위 한 줄(metaY≈350)에 그려지므로 브랜드 줄만 담기는 영역으로 검증한다.
		const brandRegion = ctx.getImageData(376, 355, 552, 35);
		const brandPixels = Array.from({ length: brandRegion.data.length / 4 }, (_, i) =>
			luma([brandRegion.data[i * 4]!, brandRegion.data[i * 4 + 1]!, brandRegion.data[i * 4 + 2]!])
		);
		expect(Math.max(...brandPixels)).toBeGreaterThan(0.25);
	});

	it('does not draw a progress bar for non-stream tracks', async () => {
		const buffer = await renderNowPlayingCard(fullInput());
		const { loadImage, Canvas } = await import('skia-canvas');
		const img = await loadImage(buffer);
		const canvas = new Canvas(960, 400);
		const ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0);
		// 예전 진행바가 있던 영역(artCursorY+44 ≈ 184)은 이제 배경/다음 곡 텍스트만 있어야 해요.
		// 어두운 배경과 텍스트 외에는 밝은 액센트 막대가 없어야 한다 — 밝기가 0.3 이하여야 해요.
		const barArea = Array.from(ctx.getImageData(400, 184, 1, 1).data.slice(0, 3));
		expect(luma(barArea as never)).toBeLessThan(0.3);
	});

	it('renders the stream card without a progress bar', async () => {
		const input = fullInput();
		input.isStream = true;
		input.positionMs = 0;
		input.durationMs = 0;
		const buffer = await renderNowPlayingCard(input);
		expectPngSize(buffer, 960, 400);
	});
});
