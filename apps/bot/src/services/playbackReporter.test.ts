import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sapphire/framework', () => ({
	container: { logger: { debug: vi.fn() }, client: { guilds: { cache: new Map() } } }
}));

import { reportNodeEvent, reportPlaybackEvent } from './playbackReporter.ts';

describe('playbackReporter', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		fetchMock.mockReset();
		fetchMock.mockResolvedValue({ ok: true });
		vi.stubGlobal('fetch', fetchMock);
		process.env.DATA_API_URL = 'http://data-api:3002';
		process.env.DATA_API_AUTH_KEY = 'test-key';
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.DATA_API_URL;
		delete process.env.DATA_API_AUTH_KEY;
	});

	it('reports node events without a guild id', async () => {
		reportNodeEvent('main', 'node_error', 'boom');
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://data-api:3002/v1/playback/events');
		expect(init.headers).toMatchObject({ 'content-type': 'application/json', authorization: 'test-key' });
		expect(JSON.parse(init.body)).toMatchObject({ type: 'node_error', guildId: null, nodeId: 'main', reason: 'boom' });
	});

	it('reports track events with guild and track info but no node', async () => {
		const track = { info: { title: '곡', author: '가수', identifier: 'track-id' } };
		reportPlaybackEvent('guild-1', 'track_error', track as never, { consecutiveErrors: 2 });
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
			type: 'track_error',
			guildId: 'guild-1',
			nodeId: null,
			trackTitle: '곡',
			trackAuthor: '가수',
			consecutiveErrors: 2
		});
	});

	it('does not call data-api when DATA_API_URL is not configured', () => {
		delete process.env.DATA_API_URL;
		reportNodeEvent('main', 'node_disconnect', null);
		reportPlaybackEvent('guild-1', 'track_start', null);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
