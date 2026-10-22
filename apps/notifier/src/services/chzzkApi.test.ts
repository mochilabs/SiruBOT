import { describe, expect, it, vi } from 'vitest';
import {
	fetchChzzkChannelProfile,
	fetchChzzkLiveStatus,
	fetchChzzkLiveThumbnail,
	resolveChzzkLiveImageUrl,
	searchChzzkChannels,
	type FetchFn
} from './chzzkApi.ts';

const CHANNEL_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('fetchChzzkLiveStatus', () => {
	it('normalizes an open live channel', async () => {
		const fetchFn: FetchFn = vi.fn(async () =>
			jsonResponse({
				code: 200,
				content: {
					channelId: CHANNEL_ID,
					channelName: '시루',
					liveId: 'live-9',
					liveTitle: '첫방송',
					openLive: true,
					liveImageUrl: 'https://livecloud-thumb.example.net/thumbnail/image_{type}.jpg'
				}
			})
		);
		const status = await fetchChzzkLiveStatus(CHANNEL_ID, fetchFn);
		expect(status.isLive).toBe(true);
		expect(status.liveId).toBe('live-9');
		expect(status.liveTitle).toBe('첫방송');
		expect(status.channelName).toBe('시루');
		expect(status.thumbnailUrl).toBe('https://livecloud-thumb.example.net/thumbnail/image_1080.jpg');
	});

	it('treats status OPEN as live even without openLive', async () => {
		const fetchFn: FetchFn = vi.fn(async () => jsonResponse({ code: 200, content: { channelId: CHANNEL_ID, status: 'OPEN', liveId: 7 } }));
		const status = await fetchChzzkLiveStatus(CHANNEL_ID, fetchFn);
		expect(status.isLive).toBe(true);
		expect(status.liveId).toBe('7');
	});

	it('treats null content as offline', async () => {
		const fetchFn: FetchFn = vi.fn(async () => jsonResponse({ code: 200, content: null }));
		const status = await fetchChzzkLiveStatus(CHANNEL_ID, fetchFn);
		expect(status.isLive).toBe(false);
		expect(status.liveId).toBeNull();
		expect(status.thumbnailUrl).toBeNull();
	});

	it('throws on non-2xx responses', async () => {
		const fetchFn: FetchFn = vi.fn(async () => jsonResponse({ code: 500 }, 503));
		await expect(fetchChzzkLiveStatus(CHANNEL_ID, fetchFn)).rejects.toThrow('chzzk live-status responded 503');
	});

	it('throws on unexpected response shapes', async () => {
		const fetchFn: FetchFn = vi.fn(async () => jsonResponse({ nope: true }));
		await expect(fetchChzzkLiveStatus(CHANNEL_ID, fetchFn)).rejects.toThrow('응답 형식');
	});
});

describe('resolveChzzkLiveImageUrl', () => {
	it('replaces the {type} placeholder with the 1080 size', () => {
		expect(resolveChzzkLiveImageUrl('https://livecloud-thumb.example.net/thumbnail/image_{type}.jpg')).toBe(
			'https://livecloud-thumb.example.net/thumbnail/image_1080.jpg'
		);
	});

	it('rejects non-http values and empty input', () => {
		expect(resolveChzzkLiveImageUrl('image_1080.jpg')).toBeNull();
		expect(resolveChzzkLiveImageUrl(null)).toBeNull();
		expect(resolveChzzkLiveImageUrl(undefined)).toBeNull();
	});
});

describe('fetchChzzkLiveThumbnail', () => {
	it('resolves the live-detail {type} template into a full image url', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse({
				code: 200,
				content: {
					status: 'OPEN',
					liveImageUrl: 'https://livecloud-thumb.akamaized.net/chzzk/livecloud/KR/stream/1/live/2/record/3/thumbnail/image_{type}.jpg'
				}
			})
		);
		expect(await fetchChzzkLiveThumbnail(CHANNEL_ID, fetchFn)).toBe(
			'https://livecloud-thumb.akamaized.net/chzzk/livecloud/KR/stream/1/live/2/record/3/thumbnail/image_1080.jpg'
		);
		const url = (fetchFn.mock.calls[0] as unknown as [string])[0];
		expect(url).toBe(`https://api.chzzk.naver.com/service/v2/channels/${CHANNEL_ID}/live-detail`);
	});

	it('returns null when the channel is no longer OPEN', async () => {
		const fetchFn: FetchFn = vi.fn(async () => jsonResponse({ code: 200, content: { status: 'CLOSE', liveImageUrl: null } }));
		expect(await fetchChzzkLiveThumbnail(CHANNEL_ID, fetchFn)).toBeNull();
	});

	it('returns null on non-2xx responses and network errors instead of throwing', async () => {
		const bad: FetchFn = vi.fn(async () => jsonResponse({}, 503));
		expect(await fetchChzzkLiveThumbnail(CHANNEL_ID, bad)).toBeNull();
		const boom: FetchFn = vi.fn(async () => {
			throw new Error('network down');
		});
		expect(await fetchChzzkLiveThumbnail(CHANNEL_ID, boom)).toBeNull();
	});
});

describe('searchChzzkChannels', () => {
	it('normalizes search results with live titles', async () => {
		const fetchFn: FetchFn = vi.fn(async () =>
			jsonResponse({
				code: 200,
				content: {
					data: [
						{
							channel: { channelId: CHANNEL_ID, channelName: '시루', followerCount: 1200, openLive: true },
							live: { liveTitle: '지금 방송 중', liveId: 3 }
						},
						{ channel: { channelId: 'b1'.repeat(16), channelName: '다른 채널' } },
						{ channel: null }
					]
				}
			})
		);
		const channels = await searchChzzkChannels('시루', 0, 10, fetchFn);
		expect(channels).toHaveLength(2);
		expect(channels[0]).toMatchObject({
			channelId: CHANNEL_ID,
			channelName: '시루',
			followerCount: 1200,
			openLive: true,
			liveTitle: '지금 방송 중'
		});
		expect(channels[1]).toMatchObject({ channelId: 'b1'.repeat(16), liveTitle: null, verifiedMark: false, followerCount: 0 });
	});

	it('requests the keyword as a query parameter (2026-10 실측 스펙)', async () => {
		const fetchFn = vi.fn(async () => jsonResponse({ code: 200, content: { data: [] } }));
		await searchChzzkChannels('시루 채널', 0, 5, fetchFn);
		const url = (fetchFn.mock.calls[0] as unknown as [string])[0];
		expect(url).toContain('/search/channels?keyword=');
		expect(url).toContain('offset=0');
		expect(url).toContain('size=5');
		expect(url).not.toContain('/search/channels/%');
	});

	it('throws on non-2xx responses', async () => {
		const fetchFn: FetchFn = vi.fn(async () => jsonResponse({}, 429));
		await expect(searchChzzkChannels('시루', 0, 10, fetchFn)).rejects.toThrow('chzzk search responded 429');
	});
});

describe('fetchChzzkChannelProfile', () => {
	it('returns a normalized channel summary', async () => {
		const fetchFn: FetchFn = vi.fn(async () =>
			jsonResponse({
				code: 200,
				content: { channelId: CHANNEL_ID, channelName: '시루', channelDescription: '게임 방송', verifiedMark: true, followerCount: 42 }
			})
		);
		const channel = await fetchChzzkChannelProfile(CHANNEL_ID, fetchFn);
		expect(channel).toMatchObject({ channelId: CHANNEL_ID, channelName: '시루', verifiedMark: true, followerCount: 42, liveTitle: null });
	});

	it('returns null when content is missing', async () => {
		const fetchFn: FetchFn = vi.fn(async () => jsonResponse({ code: 200, content: null }));
		expect(await fetchChzzkChannelProfile(CHANNEL_ID, fetchFn)).toBeNull();
	});

	it('returns null for a channel without required fields', async () => {
		const fetchFn: FetchFn = vi.fn(async () => jsonResponse({ code: 200, content: { channelId: 'x', channelName: null } }));
		expect(await fetchChzzkChannelProfile(CHANNEL_ID, fetchFn)).toBeNull();
	});
});
