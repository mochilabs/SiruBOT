import { describe, expect, it } from 'vitest';
import { renderSvgRaster } from '../shared/takumiKit.tsx';
import { brandText, NOW_PLAYING_CARD_WIDTH, renderNowPlayingCard, type NowPlayingCardInput } from './nowPlayingCard.tsx';

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

describe('renderNowPlayingCard', () => {
	it('renders a 960px-wide PNG even without artwork or avatar', async () => {
		const png = await renderNowPlayingCard(input());
		expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
		expect(size(png).width).toBe(NOW_PLAYING_CARD_WIDTH);
	}, 30_000);

	it('gets taller with each queued track preview and chapter', async () => {
		const none = size(await renderNowPlayingCard(input()));
		const three = size(
			await renderNowPlayingCard(
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
		const withChapter = size(await renderNowPlayingCard(input({ chapter: { name: 'Verse', startMs: 0, endMs: 60_000 } })));
		expect(three.height).toBeGreaterThan(none.height);
		expect(withChapter.height).toBeGreaterThanOrEqual(none.height);
	}, 30_000);

	it('has transparent rounded corners so it sits on the container as a panel', async () => {
		const png = await renderNowPlayingCard(input());
		const { width, height } = size(png);
		// PNG를 다시 raw RGBA로 풀어서 픽셀 알파를 봐요
		const raw = await renderSvgRaster(
			`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:image/png;base64,${png.toString('base64')}" width="${width}" height="${height}"/></svg>`,
			width,
			height,
			'raw'
		);
		const alphaAt = (x: number, y: number) => raw[(y * width + x) * 4 + 3];
		expect(alphaAt(0, 0)).toBe(0);
		expect(alphaAt(width >> 1, height >> 1)).toBe(255);
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
