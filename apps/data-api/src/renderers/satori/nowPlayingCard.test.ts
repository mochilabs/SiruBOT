import { describe, expect, it } from 'vitest';
import type { NowPlayingCardInput } from '../nowPlayingCard.ts';
import { brandText, NOW_PLAYING_CARD_WIDTH, renderNowPlayingCardSatori } from './nowPlayingCard.ts';

function input(patch: Partial<NowPlayingCardInput> = {}): NowPlayingCardInput {
	return {
		trackId: 'jNQXAC9IVRw',
		title: 'Rick Astley - Never Gonna Give You Up 😀',
		artist: 'Rick Astley',
		artworkUrl: null, // 테스트는 네트워크를 쓰지 않아요
		positionMs: 92_000,
		durationMs: 213_000,
		isStream: false,
		isPaused: false,
		repeatMode: 'queue',
		isRecommended: false,
		nextTracks: [],
		queueCount: 27,
		queueRemainingMs: 81 * 60_000,
		volume: 80,
		nodeId: 'main',
		brandLine: '<:radio_wave:123456789012345678> main <:volume_up:123456789012345679> 80% <:info:123456789012345680> 시루봇 4.2.1 (8a2f6c1)',
		chapter: null,
		requester: null,
		trackUrl: null,
		...patch
	};
}

const size = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

describe('renderNowPlayingCardSatori', () => {
	it('renders a 960px-wide PNG even without artwork or avatar', async () => {
		const png = await renderNowPlayingCardSatori(input());
		expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
		expect(size(png).width).toBe(NOW_PLAYING_CARD_WIDTH);
	}, 30_000);

	it('gets taller with each queued track preview and chapter', async () => {
		const none = size(await renderNowPlayingCardSatori(input()));
		const three = size(
			await renderNowPlayingCardSatori(
				input({
					nextTracks: [
						{ title: 'a', artist: 'x' },
						{ title: 'b', artist: null },
						{ title: 'c', artist: 'z' },
						{ title: 'd', artist: 'w' }
					]
				})
			)
		);
		const withChapter = size(await renderNowPlayingCardSatori(input({ chapter: { name: 'Verse', startMs: 0, endMs: 60_000 } })));
		expect(three.height).toBeGreaterThan(none.height);
		expect(withChapter.height).toBeGreaterThanOrEqual(none.height);
	}, 30_000);

	it('has transparent rounded corners so it sits on the container as a panel', async () => {
		const png = await renderNowPlayingCardSatori(input());
		const { loadImage, Canvas } = await import('skia-canvas');
		const img = await loadImage(png);
		const canvas = new Canvas(img.width, img.height);
		const ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0);
		expect(ctx.getImageData(0, 0, 1, 1).data[3]).toBe(0);
		expect(ctx.getImageData(img.width >> 1, img.height >> 1, 1, 1).data[3]).toBe(255);
	}, 30_000);
});

describe('brandText', () => {
	it('drops custom emoji codes and the node and volume tokens, keeping the bot name and version', () => {
		expect(brandText(input())).toBe('시루봇 4.2.1 (8a2f6c1)');
	});
	it('also handles unicode emoji fallbacks and a missing brand line', () => {
		expect(brandText(input({ brandLine: '📡 main 🔊 80% ℹ️ 시루봇 4.2.1' }))).toBe('시루봇 4.2.1');
		expect(brandText(input({ brandLine: null }))).toBe('시루봇');
	});
});
