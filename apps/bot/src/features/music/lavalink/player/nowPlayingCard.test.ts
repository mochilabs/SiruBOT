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

const { render } = vi.hoisted(() => ({ render: vi.fn() }));
/** 카드 함수가 받는 LavalinkDeps 역할 — 카드 캐시 상태도 여기 있어요 */
const deps = {
	dataApi: { renderNowPlayingCard: render },
	client: { guilds: { cache: new Map() } },
	nowPlayingCards: { cache: new Map(), pending: new Map(), retryAfter: new Map() }
} as never;

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
		clearNowPlayingCard(deps, 'guild');
		render.mockReset();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('renders once for concurrent callers and gives each a file to attach', async () => {
		const pending = pendingRender();
		render.mockReturnValue(pending.promise);
		const current = player();
		const first = resolveNowPlayingCard(deps, current);
		const second = resolveNowPlayingCard(deps, current);
		await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
		pending.resolve(Buffer.from('image'));
		const [a, b] = await Promise.all([first, second]);
		expect(a?.fresh).toBe(true);
		expect(b?.fresh).toBe(true);
		expect(a?.url).toBe(b?.url);
		expect(a?.file).not.toBe(b?.file);
		expect((await resolveNowPlayingCard(deps, current))?.fresh).toBe(false);
		expect(render).toHaveBeenCalledTimes(1);
	});

	it('discards an old track render that finishes after the new track', async () => {
		const old = pendingRender();
		render.mockReturnValueOnce(old.promise).mockResolvedValueOnce(Buffer.from('new'));
		const current = player();
		const first = resolveNowPlayingCard(deps, current);
		await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
		current.queue.current = track('b');
		const second = await resolveNowPlayingCard(deps, current);
		old.resolve(Buffer.from('old'));
		expect(await first).toBeNull();
		expect(second?.file.attachment).toEqual(Buffer.from('new'));
		expect((await resolveNowPlayingCard(deps, current))?.file.attachment).toEqual(Buffer.from('new'));
		expect(render).toHaveBeenCalledTimes(2);
	});

	it('shares rendering through the deps store across reloaded module copies', async () => {
		const pending = pendingRender();
		render.mockReturnValue(pending.promise);
		const current = player();
		const first = resolveNowPlayingCard(deps, current);
		await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
		vi.resetModules();
		const secondModule = await import('./nowPlayingCard.ts');
		expect(secondModule.resolveNowPlayingCard).not.toBe(resolveNowPlayingCard);
		const second = secondModule.resolveNowPlayingCard(deps, current);
		pending.resolve(Buffer.from('shared'));
		const results = await Promise.all([first, second]);
		expect(results.every((result) => result?.fresh)).toBe(true);
		expect(render).toHaveBeenCalledTimes(1);
	});

	it('does not resurrect a cleared player cache when its render finishes', async () => {
		const pending = pendingRender();
		render.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(Buffer.from('retry'));
		const current = player();
		const result = resolveNowPlayingCard(deps, current);
		await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
		clearNowPlayingCard(deps, 'guild');
		pending.resolve(Buffer.from('old'));
		expect(await result).toBeNull();
		expect((await resolveNowPlayingCard(deps, current))?.file.attachment).toEqual(Buffer.from('retry'));
		expect(render).toHaveBeenCalledTimes(2);
	});

	it('backs off repeated failures, then retries after five seconds', async () => {
		vi.useFakeTimers();
		render.mockResolvedValueOnce(null).mockResolvedValueOnce(Buffer.from('retry'));
		const current = player();
		expect(await resolveNowPlayingCard(deps, current)).toBeNull();
		expect(await resolveNowPlayingCard(deps, current)).toBeNull();
		expect(render).toHaveBeenCalledTimes(1);
		vi.setSystemTime(Date.now() + 5000);
		expect((await resolveNowPlayingCard(deps, current))?.fresh).toBe(true);
		expect(render).toHaveBeenCalledTimes(2);
	});

	it('does not make a new track wait for the previous track failure backoff', async () => {
		render.mockResolvedValueOnce(null).mockResolvedValueOnce(Buffer.from('next'));
		const current = player();
		await resolveNowPlayingCard(deps, current);
		current.queue.current = track('b');
		expect((await resolveNowPlayingCard(deps, current))?.fresh).toBe(true);
		expect(render).toHaveBeenCalledTimes(2);
	});

	it('reads the cache without waiting for or starting a render', async () => {
		const pending = pendingRender();
		render.mockReturnValue(pending.promise);
		const current = player();
		expect(getCachedNowPlayingCard(deps, current)).toBeNull();
		expect(render).not.toHaveBeenCalled();
		const result = resolveNowPlayingCard(deps, current);
		expect(getCachedNowPlayingCard(deps, current)).toBeNull();
		pending.resolve(Buffer.from('ready'));
		await result;
		expect(getCachedNowPlayingCard(deps, current)?.file.attachment).toEqual(Buffer.from('ready'));
		expect(render).toHaveBeenCalledTimes(1);
	});

	it('keeps a replacement player render when the old instance completes', async () => {
		const old = pendingRender();
		render.mockReturnValueOnce(old.promise).mockResolvedValueOnce(Buffer.from('replacement'));
		const result = resolveNowPlayingCard(deps, player());
		await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
		const replacement = player();
		await resolveNowPlayingCard(deps, replacement);
		old.resolve(Buffer.from('old'));
		expect(await result).toBeNull();
		expect((await resolveNowPlayingCard(deps, replacement))?.file.attachment).toEqual(Buffer.from('replacement'));
	});

	it('does not bucket by position, but reacts to volume/chapter/pause/repeat', () => {
		const current = player();
		current.queue.current!.info.duration = 60_000;
		const k0 = getNowPlayingCardKey(current!);
		expect(k0).toContain('::roff');
		expect(k0).not.toContain('::p');
		Object.defineProperty(current, 'position', { value: 5000 });
		expect(getNowPlayingCardKey(current!)!).toBe(k0);
		current.paused = true;
		const kPaused = getNowPlayingCardKey(current!)!;
		expect(kPaused).toContain(':paused');
		current.paused = false;
		current.volume = 50;
		const kVol = getNowPlayingCardKey(current!)!;
		expect(kVol).toContain('::v50');
	});

	it('treats only same-track keys as the same identity', () => {
		const a = 'video-1::v100::cnone::r off';
		const aLater = 'video-1::v100::c1::r off';
		const b = 'video-2::v100::cnone::r off';
		expect(sameNowPlayingTrackIdentity(a, aLater)).toBe(true);
		expect(sameNowPlayingTrackIdentity(a, b)).toBe(false);
	});

	it('stops reusing the displayed card once the track changes', async () => {
		render.mockResolvedValueOnce(Buffer.from('bucket-0'));
		const current = player();
		await resolveNowPlayingCard(deps, current);
		current.queue.current = track('b');
		expect(getDisplayNowPlayingCard(deps, current)).toBeNull();
	});
});
