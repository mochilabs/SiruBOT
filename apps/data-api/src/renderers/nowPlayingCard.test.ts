import { describe, expect, it } from 'vitest';
import { contentBounds, renderNowPlayingCard } from './nowPlayingCard.ts';

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
	it('renders a 960x300 PNG', async () => {
		const buffer = await renderNowPlayingCard(fullInput());
		expectPngSize(buffer, 960, 300);
		expect(buffer.length).toBeGreaterThan(1_000);
	});

	it('is a transparent PNG with the title and footer text drawn in light colors', async () => {
		const buffer = await renderNowPlayingCard(fullInput());
		const { loadImage, Canvas } = await import('skia-canvas');
		const img = await loadImage(buffer);
		const canvas = new Canvas(960, 300);
		const ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0);
		// 우하단 모서리(텍스트 없음)는 완전 투명이어야 해요 — 배경을 칠하지 않아요.
		expect(ctx.getImageData(958, 120, 1, 1).data[3]).toBe(0);
		// 제목 영역(x≥244, y 55~95)에 밝은 불투명 픽셀이 있어야 해요.
		const title = ctx.getImageData(244, 55, 400, 40).data;
		let bright = 0;
		for (let i = 0; i < title.length; i += 4) if (title[i + 3]! > 200 && luma([title[i]!, title[i + 1]!, title[i + 2]!]) > 0.8) bright++;
		expect(bright).toBeGreaterThan(50);
		// 하단 한 줄(브랜드줄)에도 글자가 그려져 있어야 해요.
		const footer = ctx.getImageData(244, 280, 400, 20).data;
		let ink = 0;
		for (let i = 0; i < footer.length; i += 4) if (footer[i + 3]! > 100) ink++;
		expect(ink).toBeGreaterThan(30);
	});

	it('renders the stream card without a progress bar', async () => {
		const input = fullInput();
		input.isStream = true;
		input.positionMs = 0;
		input.durationMs = 0;
		const buffer = await renderNowPlayingCard(input);
		expectPngSize(buffer, 960, 300);
	});
});

describe('contentBounds', () => {
	it('trims black pillarbox bars from a thumbnail', async () => {
		const { Canvas, loadImage } = await import('skia-canvas');
		const canvas = new Canvas(480, 360);
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, 480, 360);
		ctx.fillStyle = '#3a7bd5';
		ctx.fillRect(100, 0, 280, 360);
		const bounds = await contentBounds(await loadImage(await canvas.toBuffer('png')));
		expect(bounds.sx).toBeGreaterThanOrEqual(98);
		expect(bounds.sx).toBeLessThanOrEqual(102);
		expect(bounds.sw).toBeGreaterThanOrEqual(276);
		expect(bounds.sw).toBeLessThanOrEqual(284);
		expect(bounds.sy).toBe(0);
		expect(bounds.sh).toBe(360);
	});

	it('keeps the whole image when it is mostly dark artwork', async () => {
		const { Canvas, loadImage } = await import('skia-canvas');
		const canvas = new Canvas(480, 360);
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, 480, 360);
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(230, 170, 20, 20);
		const bounds = await contentBounds(await loadImage(await canvas.toBuffer('png')));
		expect(bounds).toEqual({ sx: 0, sy: 0, sw: 480, sh: 360 });
	});
});
