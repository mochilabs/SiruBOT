import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setConfigForTesting } from '../../../lib/config.ts';
import { makeTestConfig } from '../../../lib/config.testing.ts';
import { PlaybackReporter } from './playbackReporter.ts';

describe('playbackReporter', () => {
	const fetchMock = vi.fn();
	const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
	let reporter: PlaybackReporter;

	beforeEach(() => {
		// 테스트마다 새로 만들어요 — client는 호출 시점에 읽어요
		reporter = new PlaybackReporter({ logger, getClient: () => ({ guilds: { cache: new Map() } }) as never });
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
		reporter.reportNodeEvent('main', 'node_error', 'boom');
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('http://data-api:3002/v1/playback/events');
		expect(init.headers).toMatchObject({ 'content-type': 'application/json', authorization: 'test-key' });
		expect(JSON.parse(init.body)).toMatchObject({ type: 'node_error', guildId: null, nodeId: 'main', reason: 'boom' });
	});

	it('reports track events with guild and track info but no node', async () => {
		const track = { info: { title: '곡', author: '가수', identifier: 'track-id' } };
		reporter.reportPlaybackEvent('guild-1', 'track_error', track as never, { consecutiveErrors: 2 });
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

	it('can be constructed before the client exists and reads it when reporting', async () => {
		let client: { guilds: { cache: Map<string, { shardId: number }> } } | undefined;
		const lazy = new PlaybackReporter({ logger, getClient: () => client as never });
		client = { guilds: { cache: new Map([['guild-1', { shardId: 3 }]]) } };
		lazy.reportPlaybackEvent('guild-1', 'track_start', null);
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ type: 'track_start', shardId: 3 });
	});

	it('does not call data-api when DATA_API_URL is not configured', () => {
		setConfigForTesting(makeTestConfig({ DATA_API_AUTH_KEY: 'test-key' }));
		reporter.reportNodeEvent('main', 'node_disconnect', null);
		reporter.reportPlaybackEvent('guild-1', 'track_start', null);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('stop() waits for reports already in flight', async () => {
		let finish!: () => void;
		fetchMock.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
		reporter.reportNodeEvent('main', 'node_error', 'boom');
		expect(fetchMock).toHaveBeenCalledOnce();

		let stopped = false;
		const stopping = reporter.stop().then(() => (stopped = true));
		await new Promise((resolve) => setImmediate(resolve));
		expect(stopped).toBe(false);
		finish();
		await stopping;
		expect(stopped).toBe(true);
	});

	it('sends nothing after stop()', async () => {
		await reporter.stop();
		reporter.reportNodeEvent('main', 'node_error', 'late');
		reporter.reportPlaybackEvent('guild-1', 'track_start', null);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
