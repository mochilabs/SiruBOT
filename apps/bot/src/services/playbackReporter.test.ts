import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sapphire/framework', () => ({
	container: { logger: { debug: vi.fn() }, client: { guilds: { cache: new Map() } } }
}));

import { setConfigForTesting } from '../lib/config.ts';
import { makeTestConfig } from '../lib/config.testing.ts';
import { container } from '@sapphire/framework';
import { PlaybackReporter, reportNodeEvent, reportPlaybackEvent } from './playbackReporter.ts';

describe('playbackReporter', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		// 리포터 소유자는 container.playbackReporter — 테스트마다 새로 만들어요
		container.playbackReporter = new PlaybackReporter();
		fetchMock.mockReset();
		fetchMock.mockResolvedValue({ ok: true });
		vi.stubGlobal('fetch', fetchMock);
		setConfigForTesting(makeTestConfig({ DATA_API_URL: 'http://data-api:3002', DATA_API_AUTH_KEY: 'test-key' }));
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		setConfigForTesting(null);
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
		setConfigForTesting(makeTestConfig({ DATA_API_AUTH_KEY: 'test-key' }));
		reportNodeEvent('main', 'node_disconnect', null);
		reportPlaybackEvent('guild-1', 'track_start', null);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('stop() waits for reports already in flight', async () => {
		let finish!: () => void;
		fetchMock.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
		reportNodeEvent('main', 'node_error', 'boom');
		expect(fetchMock).toHaveBeenCalledOnce();

		let stopped = false;
		const stopping = container.playbackReporter.stop().then(() => (stopped = true));
		await new Promise((resolve) => setImmediate(resolve));
		expect(stopped).toBe(false);
		finish();
		await stopping;
		expect(stopped).toBe(true);
	});

	it('sends nothing after stop()', async () => {
		await container.playbackReporter.stop();
		reportNodeEvent('main', 'node_error', 'late');
		reportPlaybackEvent('guild-1', 'track_start', null);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
