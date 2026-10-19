import { describe, expect, it } from 'vitest';
import { boothEmbedFixResult, instagramEmbedFixResult, xEmbedFixResult } from './embedFix.ts';
import type { FxTwitterStatus } from '@sirubot/utils';

const X_LINK = { site: 'x', url: 'https://x.com/jack/status/20', fixedUrl: 'https://fixupx.com/jack/status/20' } as const;
const INSTAGRAM_LINK = {
	site: 'instagram',
	url: 'https://www.instagram.com/p/BsOGulcndj-/',
	fixedUrl: 'https://www.kkinstagram.com/p/BsOGulcndj-/'
} as const;
const BOOTH_LINK = { site: 'booth', url: 'https://booth.pm/ko/items/8711621' } as const;

const STATUS: FxTwitterStatus = {
	url: 'https://x.com/jack/status/20',
	text: 'just setting up my twttr',
	authorName: 'Jack',
	authorHandle: 'jack',
	authorAvatar: 'https://pbs.twimg.com/profile_images/xxx_400x400.jpg',
	photos: ['https://pbs.twimg.com/media/abc?format=jpg&name=large'],
	hasVideo: false,
	hasPoll: false,
	hasQuote: false,
	replyCount: 120,
	retweetCount: 34,
	likeCount: 560,
	createdAt: 1_142_974_214
};

describe('xEmbedFixResult', () => {
	it('maps a photo tweet to a card with author and stats', () => {
		const result = xEmbedFixResult(X_LINK, STATUS);
		expect(result.site).toBe('x');
		expect(result.mode).toBe('card');
		if (result.mode !== 'card') return;
		expect(result.authorName).toBe('Jack');
		expect(result.authorHandle).toBe('jack');
		expect(result.description).toBe('just setting up my twttr');
		expect(result.images).toEqual(['https://pbs.twimg.com/media/abc?format=jpg&name=large']);
		expect(result.replyCount).toBe(120);
		expect(result.retweetCount).toBe(34);
		expect(result.likeCount).toBe(560);
		expect(result.createdAt).toBe(1_142_974_214);
		expect(result.sourceUrl).toBe(X_LINK.url);
	});

	it('falls back to the fixed link for video tweets', () => {
		const result = xEmbedFixResult(X_LINK, { ...STATUS, hasVideo: true });
		expect(result.mode).toBe('link');
		if (result.mode !== 'link') return;
		expect(result.fixedUrl).toBe(X_LINK.fixedUrl);
	});

	it('falls back to the fixed link when the tweet is unavailable (deleted)', () => {
		const result = xEmbedFixResult(X_LINK, null);
		expect(result.mode).toBe('link');
		if (result.mode !== 'link') return;
		expect(result.fixedUrl).toBe(X_LINK.fixedUrl);
	});

	it('returns a link without fixedUrl when the caller did not provide one', () => {
		const result = xEmbedFixResult({ site: 'x', url: X_LINK.url }, null);
		expect(result.mode).toBe('link');
		expect(result.fixedUrl).toBeUndefined();
	});
});

describe('instagramEmbedFixResult', () => {
	it('maps a live post to a card with the kkinstagram media url', () => {
		const result = instagramEmbedFixResult(INSTAGRAM_LINK, true);
		expect(result.mode).toBe('card');
		if (result.mode !== 'card') return;
		expect(result.images).toEqual([INSTAGRAM_LINK.fixedUrl]);
		expect(result.sourceUrl).toBe(INSTAGRAM_LINK.url);
	});

	it('falls back to the fixed link when the post does not resolve to an image', () => {
		const result = instagramEmbedFixResult(INSTAGRAM_LINK, false);
		expect(result.mode).toBe('link');
		if (result.mode !== 'link') return;
		expect(result.fixedUrl).toBe(INSTAGRAM_LINK.fixedUrl);
	});
});

describe('boothEmbedFixResult', () => {
	it('maps a live product to a card with the original-resolution image', () => {
		const result = boothEmbedFixResult(BOOTH_LINK, {
			title: '테스트 상품',
			description: '설명',
			image: 'https://booth.pximg.net/uuid/i/1/uuid_base_resized.jpg',
			url: BOOTH_LINK.url
		});
		expect(result.mode).toBe('card');
		if (result.mode !== 'card') return;
		expect(result.title).toBe('테스트 상품');
		expect(result.images).toEqual(['https://booth.pximg.net/uuid/i/1/uuid_base_resized.jpg']);
		expect(result.sourceUrl).toBe(BOOTH_LINK.url);
	});

	it('skips when the product is unavailable', () => {
		const result = boothEmbedFixResult(BOOTH_LINK, null);
		expect(result.mode).toBe('skip');
	});
});
