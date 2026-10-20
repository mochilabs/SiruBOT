import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
	fetchYouTubeUploadsFeed,
	parseYouTubeAtomFeed,
	resolveYouTubeChannel,
	subscribeYouTubeChannel,
	verifyWebSubSignature,
	type YouTubeFetchFn
} from './youtubeWebSub.ts';

const CHANNEL_ID = 'UCxxxxxxxxxxxxxxxxxxxxxx';
const SECRET = 'hub-secret';

function xmlResponse(body: string, status = 200): Response {
	return new Response(body, { status, headers: { 'Content-Type': 'application/atom+xml' } });
}

function feedXml(entries: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
	<link rel="hub" href="https://pubsubhubbub.appspot.com/" />
	<title>시루 채널</title>
	<yt:channelId>${CHANNEL_ID}</yt:channelId>
	${entries}
</feed>`;
}

function entryXml(videoId: string, title: string, published: string, withLink = true): string {
	const link = withLink ? `<link rel="alternate" href="https://www.youtube.com/watch?v=${videoId}" />` : '';
	return `<entry>
	<title>${title}</title>
	${link}
	<yt:videoId>${videoId}</yt:videoId>
	<published>${published}</published>
	<author><name>시루</name></author>
</entry>`;
}

describe('parseYouTubeAtomFeed', () => {
	it('parses a single-entry feed into one event', () => {
		const { channelId, events } = parseYouTubeAtomFeed(feedXml(entryXml('abc123', '새 영상', '2026-10-19T10:00:00.000Z')));
		expect(channelId).toBe(CHANNEL_ID);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			platform: 'youtube',
			sourceId: CHANNEL_ID,
			contentId: 'abc123',
			title: '새 영상',
			url: 'https://www.youtube.com/watch?v=abc123',
			thumbnail: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
			author: '시루'
		});
	});

	it('parses a multi-entry feed and skips incomplete entries', () => {
		const entries = `${entryXml('vid1', '영상 1', '2026-10-19T10:00:00.000Z')}${entryXml('vid2', '영상 2', '2026-10-18T10:00:00.000Z')}<entry><title>videoId 없음</title></entry>`;
		const { events } = parseYouTubeAtomFeed(feedXml(entries));
		expect(events.map((event) => event.contentId)).toEqual(['vid1', 'vid2']);
	});

	it('falls back to the watch url when the entry has no alternate link', () => {
		const { events } = parseYouTubeAtomFeed(feedXml(entryXml('no-link', '링크 없음', '2026-10-19T10:00:00.000Z', false)));
		expect(events[0]?.url).toBe('https://www.youtube.com/watch?v=no-link');
	});

	it('returns an empty result for invalid xml', () => {
		expect(parseYouTubeAtomFeed('<feed><unclosed>')).toEqual({ channelId: null, events: [] });
	});

	it('returns an empty result when the channel id is missing', () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>채널 없음</title></feed>`;
		expect(parseYouTubeAtomFeed(xml)).toEqual({ channelId: null, events: [] });
	});
});

describe('verifyWebSubSignature', () => {
	it('accepts a valid hmac signature', () => {
		const rawBody = '<feed>알림 본문</feed>';
		const header = `sha256=${createHmac('sha256', SECRET).update(rawBody, 'utf8').digest('hex')}`;
		expect(verifyWebSubSignature(rawBody, header, SECRET)).toBe(true);
	});

	it('rejects a tampered body', () => {
		const header = `sha256=${createHmac('sha256', SECRET).update('원본 본문', 'utf8').digest('hex')}`;
		expect(verifyWebSubSignature('변조된 본문', header, SECRET)).toBe(false);
	});

	it('rejects a wrong secret and missing headers', () => {
		const rawBody = '본문';
		const header = `sha256=${createHmac('sha256', '다른 시크릿').update(rawBody, 'utf8').digest('hex')}`;
		expect(verifyWebSubSignature(rawBody, header, SECRET)).toBe(false);
		expect(verifyWebSubSignature(rawBody, undefined, SECRET)).toBe(false);
		expect(verifyWebSubSignature(rawBody, 'sha1=deadbeef', SECRET)).toBe(false);
	});
});

describe('resolveYouTubeChannel', () => {
	it('resolves a direct UC id without any fetch', async () => {
		const fetchFn: YouTubeFetchFn = vi.fn();
		const resolved = await resolveYouTubeChannel(`${CHANNEL_ID}`, fetchFn);
		expect(resolved).toEqual({ channelId: CHANNEL_ID, channelName: null });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('resolves a handle by fetching the channel page', async () => {
		const fetchFn: YouTubeFetchFn = vi.fn(async () =>
			xmlResponse(`<html><title>시루 채널 - YouTube</title><script>{"channelId":"${CHANNEL_ID}"}</script></html>`)
		);
		const resolved = await resolveYouTubeChannel('@siru', fetchFn);
		expect(resolved).toEqual({ channelId: CHANNEL_ID, channelName: '시루 채널' });
		expect(fetchFn).toHaveBeenCalledWith('https://www.youtube.com/@siru', expect.anything());
	});

	it('throws when the page contains no channel id', async () => {
		const fetchFn: YouTubeFetchFn = vi.fn(async () => xmlResponse('<html><title>없음 - YouTube</title></html>'));
		await expect(resolveYouTubeChannel('@ghost', fetchFn)).rejects.toThrow('UC...');
	});
});

describe('subscribeYouTubeChannel', () => {
	it('returns true on hub acceptance', async () => {
		const fetchFn: YouTubeFetchFn = vi.fn(async () => new Response('', { status: 202 }));
		const ok = await subscribeYouTubeChannel({
			channelId: CHANNEL_ID,
			callbackUrl: 'https://example.com/pubsub/youtube',
			secret: SECRET,
			fetchFn
		});
		expect(ok).toBe(true);
	});

	it('returns false on hub rejection or network failure', async () => {
		const rejected: YouTubeFetchFn = vi.fn(async () => new Response('', { status: 500 }));
		expect(await subscribeYouTubeChannel({ channelId: CHANNEL_ID, callbackUrl: 'https://example.com', secret: SECRET, fetchFn: rejected })).toBe(
			false
		);
		const offline: YouTubeFetchFn = vi.fn(async () => {
			throw new Error('network down');
		});
		expect(await subscribeYouTubeChannel({ channelId: CHANNEL_ID, callbackUrl: 'https://example.com', secret: SECRET, fetchFn: offline })).toBe(
			false
		);
	});
});

describe('fetchYouTubeUploadsFeed', () => {
	it('returns the raw feed xml', async () => {
		const xml = feedXml(entryXml('abc', '제목', '2026-10-19T10:00:00.000Z'));
		const fetchFn: YouTubeFetchFn = vi.fn(async () => xmlResponse(xml));
		expect(await fetchYouTubeUploadsFeed(CHANNEL_ID, fetchFn)).toBe(xml);
	});

	it('throws on non-2xx responses', async () => {
		const fetchFn: YouTubeFetchFn = vi.fn(async () => xmlResponse('', 404));
		await expect(fetchYouTubeUploadsFeed(CHANNEL_ID, fetchFn)).rejects.toThrow('HTTP 404');
	});
});
