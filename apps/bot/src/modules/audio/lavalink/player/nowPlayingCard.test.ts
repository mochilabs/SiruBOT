import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from 'lavalink-client';
import type { CustomPlayer } from './customPlayer.ts';
import { clearNowPlayingCard, resolveNowPlayingCard } from './nowPlayingCard.ts';

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

	it('retries after a failed render rather than caching failure', async () => {
		render.mockResolvedValueOnce(null).mockResolvedValueOnce(Buffer.from('retry'));
		const current = player();
		expect(await resolveNowPlayingCard(current)).toBeNull();
		expect((await resolveNowPlayingCard(current))?.fresh).toBe(true);
		expect(render).toHaveBeenCalledTimes(2);
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
});
