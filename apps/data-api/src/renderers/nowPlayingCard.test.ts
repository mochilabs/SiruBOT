import { describe, expect, it } from 'vitest';
import { renderNowPlayingCard } from './nowPlayingCard.ts';

/** 카드 렌더 스모크 — 960×372 PNG 시그니처와 진행바 픽셀(채워진/빈 구간)을 검증해요. */

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

describe('renderNowPlayingCard', () => {
	it('renders a 960x372 PNG', async () => {
		const buffer = await renderNowPlayingCard(fullInput());
		expectPngSize(buffer, 960, 372);
		expect(buffer.length).toBeGreaterThan(1_000);
	});

	it('draws the progress bar at the payload ratio', async () => {
		const buffer = await renderNowPlayingCard(fullInput());
		const { loadImage } = await import('skia-canvas');
		const img = await loadImage(buffer);
		const { Canvas } = await import('skia-canvas');
		const canvas = new Canvas(960, 372);
		const ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0);
		// 카드 기준 진행바: artCursorY(140)+44 = 184행, 바 두께 10 → y=189
		// position 92s/213s ≈ 0.432 → 채워진 구간(x=400)과 빈 구간(x=850)의 색이 달라야 해요.
		const filled = Array.from(ctx.getImageData(400, 189, 1, 1).data.slice(0, 3));
		const empty = Array.from(ctx.getImageData(850, 189, 1, 1).data.slice(0, 3));
		// 채워진 구간은 어두운 배경(#141a26±)보다 밝은 액센트색이어야 해요.
		// 빈 구간은 흐린 트랙 배경(rgba(255,255,255,0.12) luma≈0.23) — 배경보다 살짝 밝고 액센트보다 확실히 어두워요.
		const luma = ([r, g, b]: number[]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
		expect(luma(filled as never)).toBeGreaterThan(luma(empty as never));
		expect(luma(empty as never)).toBeLessThan(0.3);
	});

	it('renders the stream card without a progress bar', async () => {
		const input = fullInput();
		input.isStream = true;
		input.positionMs = 0;
		input.durationMs = 0;
		const buffer = await renderNowPlayingCard(input);
		expectPngSize(buffer, 960, 372);
	});
});
