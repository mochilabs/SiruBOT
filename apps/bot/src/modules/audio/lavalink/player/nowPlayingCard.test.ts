import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from 'lavalink-client';
import type { CustomPlayer } from './customPlayer.ts';
import {
	clearNowPlayingCard,
	getCachedNowPlayingCard,
	getDisplayNowPlayingCard,
	getNowPlayingCardKey,
	resolveNowPlayingCard,
	sameNowPlayingTrackIdentity
} from './nowPlayingCard.ts';

const { render, sharedContainer } = vi.hoisted(() => ({ render: vi.fn(), sharedContainer: {} }));
vi.mock('../../../../services/dataApiClient.ts', () => ({ renderNowPlayingCard: render }));
vi.mock('@sapphire/framework', () => ({ container: sharedContainer }));

function track(id: string): Track {
	return {
		info: {
			identifier: id,
			title: id,
			author: 'artist',
			duration: 1000,
			artworkUrl: null,
			uri: `https://youtube.com/watch?v=${id}`,
			sourceName: 'youtube',
			isSeekable: true,
			isStream: false,
			isrc: null
		},
		pluginInfo: {},
		requester: { id: 'related_track' }
	};
}

function player(id = 'a'): CustomPlayer {
	return { guildId: 'guild', position: 0, queue: { current: track(id), tracks: [] } } as unknown as CustomPlayer;
}

function pendingRender() {
	let resolve!: (buffer: Buffer | null) => void;
	const promise = new Promise<Buffer | null>((done) => (resolve = done));
	return { promise, resolve };
}

describe('now playing render sharing', () => {
	beforeEach(() => {
		clearNowPlayingCard('guild');
		render.mockReset();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('renders once for concurrent callers and gives each a file to attach', async () => {
		const pending = pendingRender();
		render.mockReturnValue(pending.promise);
		const current = player();
		const first = resolveNowPlayingCard(current);
		const second = resolveNowPlayingCard(current);
		await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
		pending.resolve(Buffer.from('image'));
		const [a, b] = await Promise.all([first, second]);
		expect(a?.fresh).toBe(true);
		expect(b?.fresh).toBe(true);
		expect(a?.url).toBe(b?.url);
		expect(a?.file).not.toBe(b?.file);
		expect((await resolveNowPlayingCard(current))?.fresh).toBe(false);
		expect(render).toHaveBeenCalledTimes(1);
	});

	it('discards an old track render that finishes after the new track', async () => {
		const old = pendingRender();
		render.mockReturnValueOnce(old.promise).mockResolvedValueOnce(Buffer.from('new'));
		const current = player();
		const first = resolveNowPlayingCard(current);
		await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
		current.queue.current = track('b');
		const second = await resolveNowPlayingCard(current);
		old.resolve(Buffer.from('old'));
		expect(await first).toBeNull();
		expect(second?.file.attachment).toEqual(Buffer.from('new'));
		expect((await resolveNowPlayingCard(current))?.file.attachment).toEqual(Buffer.from('new'));
		expect(render).toHaveBeenCalledTimes(2);
	});

	it('shares rendering between separately loaded copies of the module', async () => {
		const pending = pendingRender();
		render.mockReturnValue(pending.promise);
		const current = player();
		const first = resolveNowPlayingCard(current);
		await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
		vi.resetModules();
		const secondModule = await import('./nowPlayingCard.ts');
		expect(secondModule.resolveNowPlayingCard).not.toBe(resolveNowPlayingCard);
		const second = secondModule.resolveNowPlayingCard(current);
		pending.resolve(Buffer.from('shared'));
		const results = await Promise.all([first, second]);
		expect(results.every((result) => result?.fresh)).toBe(true);
		expect(render).toHaveBeenCalledTimes(1);
	});

	it('does not resurrect a cleared player cache when its render finishes', async () => {
		const pending = pendingRender();
		render.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(Buffer.from('retry'));
		const current = player();
		const result = resolveNowPlayingCard(current);
		await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
		clearNowPlayingCard('guild');
		pending.resolve(Buffer.from('old'));
		expect(await result).toBeNull();
		expect((await resolveNowPlayingCard(current))?.file.attachment).toEqual(Buffer.from('retry'));
		expect(render).toHaveBeenCalledTimes(2);
	});

	it('backs off repeated failures, then retries after five seconds', async () => {
		vi.useFakeTimers();
		render.mockResolvedValueOnce(null).mockResolvedValueOnce(Buffer.from('retry'));
		const current = player();
		expect(await resolveNowPlayingCard(current)).toBeNull();
		expect(await resolveNowPlayingCard(current)).toBeNull();
		expect(render).toHaveBeenCalledTimes(1);
		vi.setSystemTime(Date.now() + 5000);
		expect((await resolveNowPlayingCard(current))?.fresh).toBe(true);
		expect(render).toHaveBeenCalledTimes(2);
	});

	it('does not make a new track wait for the previous track failure backoff', async () => {
		render.mockResolvedValueOnce(null).mockResolvedValueOnce(Buffer.from('next'));
		const current = player();
		await resolveNowPlayingCard(current);
		current.queue.current = track('b');
		expect((await resolveNowPlayingCard(current))?.fresh).toBe(true);
		expect(render).toHaveBeenCalledTimes(2);
	});

	it('reads the cache without waiting for or starting a render', async () => {
		const pending = pendingRender();
		render.mockReturnValue(pending.promise);
		const current = player();
		expect(getCachedNowPlayingCard(current)).toBeNull();
		expect(render).not.toHaveBeenCalled();
		const result = resolveNowPlayingCard(current);
		expect(getCachedNowPlayingCard(current)).toBeNull();
		pending.resolve(Buffer.from('ready'));
		await result;
		expect(getCachedNowPlayingCard(current)?.file.attachment).toEqual(Buffer.from('ready'));
		expect(render).toHaveBeenCalledTimes(1);
	});

	it('keeps a replacement player render when the old instance completes', async () => {
		const old = pendingRender();
		render.mockReturnValueOnce(old.promise).mockResolvedValueOnce(Buffer.from('replacement'));
		const result = resolveNowPlayingCard(player());
		await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
		const replacement = player();
		await resolveNowPlayingCard(replacement);
		old.resolve(Buffer.from('old'));
		expect(await result).toBeNull();
		expect((await resolveNowPlayingCard(replacement))?.file.attachment).toEqual(Buffer.from('replacement'));
	});

	it('buckets the card key every five seconds and on pause changes', () => {
		const current = player();
		current.queue.current!.info.duration = 60_000;
		const k0 = getNowPlayingCardKey(current!);
		expect(k0).toContain('::p0');
		expect(k0).toContain('::roff');
		Object.defineProperty(current, 'position', { value: 4999 });
		expect(getNowPlayingCardKey(current!)!).toBe(k0);
		Object.defineProperty(current, 'position', { value: 5000 });
		expect(getNowPlayingCardKey(current!)!).not.toBe(k0);
		expect(getNowPlayingCardKey(current!)!).toContain('::p1');
		current.paused = true;
		expect(getNowPlayingCardKey(current!)!).toContain(':paused');
		current.queue.current!.info.isStream = true;
		expect(getNowPlayingCardKey(current!)!).toContain('::px');
	});

	it('treats only same-track keys as the same identity', () => {
		const a = 'video-1::v100::cnone::p0::r off';
		const aLater = 'video-1::v100::cnone::p1::r off';
		const b = 'video-2::v100::cnone::p0::r off';
		expect(sameNowPlayingTrackIdentity(a, aLater)).toBe(true);
		expect(sameNowPlayingTrackIdentity(a, b)).toBe(false);
	});

	it('serves the previous bucket card while the next five-second bucket is rendering', async () => {
		render.mockResolvedValueOnce(Buffer.from('bucket-0')).mockResolvedValueOnce(Buffer.from('bucket-1'));
		const current = player();
		current.queue.current!.info.duration = 60_000;
		const first = await resolveNowPlayingCard(current);
		expect(first?.trackKey).toContain('::p0');
		Object.defineProperty(current, 'position', { value: 5000 });
		// 최신 버킷은 아직 렌더 전 — strict 캐시는 비지만 표시용으로는 이전 버킷을 준다.
		expect(getCachedNowPlayingCard(current)).toBeNull();
		const displayed = getDisplayNowPlayingCard(current);
		expect(displayed?.trackKey).toBe(first?.trackKey);
		const second = await resolveNowPlayingCard(current);
		expect(second?.fresh).toBe(true);
		expect(second?.filename).toBe(first?.filename); // 같은 곡은 같은 파일명 — 메시지 첨부 교체용
		expect(second?.trackKey).not.toBe(first?.trackKey);
		expect(displayed?.trackKey).toBe(first?.trackKey);
	});

	it('stops reusing the displayed card once the track changes', async () => {
		render.mockResolvedValueOnce(Buffer.from('bucket-0'));
		const current = player();
		await resolveNowPlayingCard(current);
		current.queue.current = track('b');
		expect(getDisplayNowPlayingCard(current)).toBeNull();
	});
});
