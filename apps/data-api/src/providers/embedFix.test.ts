import { describe, expect, it } from 'vitest';
import {
	boothEmbedFixResult,
	instagramEmbedFixResult,
	mergeInstagramMeta,
	ogEmbedFixResult,
	parseKirkstagramGallery,
	xEmbedFixResult
} from './embedFix.ts';
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
	it('maps a merged post meta to a card with author, caption and media', () => {
		const result = instagramEmbedFixResult(INSTAGRAM_LINK, {
			author: '@girlgangcraft',
			caption: '캡션 텍스트',
			images: ['https://kirkstagram.com/images/Dd9mHhJIMz9/1', 'https://kirkstagram.com/images/Dd9mHhJIMz9/2'],
			videoUrl: 'https://kirkstagram.com/videos/Dd9mHhJIMz9/7'
		});
		expect(result.mode).toBe('card');
		if (result.mode !== 'card') return;
		expect(result.title).toBe('@girlgangcraft');
		expect(result.description).toBe('캡션 텍스트');
		expect(result.images).toEqual(['https://kirkstagram.com/images/Dd9mHhJIMz9/1', 'https://kirkstagram.com/images/Dd9mHhJIMz9/2']);
		expect(result.videoUrl).toBe('https://kirkstagram.com/videos/Dd9mHhJIMz9/7');
		expect(result.sourceUrl).toBe(INSTAGRAM_LINK.url);
	});

	it('maps a kkinstagram image-only fallback to a card without title', () => {
		const result = instagramEmbedFixResult(INSTAGRAM_LINK, { author: null, caption: null, images: [INSTAGRAM_LINK.fixedUrl], videoUrl: null });
		expect(result.mode).toBe('card');
		if (result.mode !== 'card') return;
		expect(result.title).toBeUndefined();
		expect(result.images).toEqual([INSTAGRAM_LINK.fixedUrl]);
	});

	it('falls back to the fixed link when the post has no meta at all', () => {
		const result = instagramEmbedFixResult(INSTAGRAM_LINK, null);
		expect(result.mode).toBe('link');
		if (result.mode !== 'link') return;
		expect(result.fixedUrl).toBe(INSTAGRAM_LINK.fixedUrl);
	});
});

const KIRK_GALLERY_HTML = `
	<html><head>
	<meta property="og:title" content="@girlgangcraft"/>
	<meta property="og:image" content="/grid/Dd9mHhJIMz9"/>
	<script id="discord:component-embed" type="application/json">{"component":{"type":17,"components":[
		{"type":10,"content":"**@girlgangcraft**"},
		{"type":12,"items":[
			{"media":{"url":"https://kirkstagram.com/images/Dd9mHhJIMz9/1"}},
			{"media":{"url":"https://kirkstagram.com/images/Dd9mHhJIMz9/2"}},
			{"media":{"url":"https://kirkstagram.com/videos/Dd9mHhJIMz9/7"}}
		]},
		{"type":1,"components":[{"type":2,"style":5,"url":"https://instagram.com/p/Dd9mHhJIMz9/","label":"Open on Instagram"}]}
	]}}</script>
	</head></html>`;

describe('parseKirkstagramGallery', () => {
	it('extracts the media gallery (type 12) from the component embed JSON', () => {
		expect(parseKirkstagramGallery(KIRK_GALLERY_HTML)).toEqual([
			'https://kirkstagram.com/images/Dd9mHhJIMz9/1',
			'https://kirkstagram.com/images/Dd9mHhJIMz9/2',
			'https://kirkstagram.com/videos/Dd9mHhJIMz9/7'
		]);
	});

	it('returns an empty list when the embed JSON is missing or broken', () => {
		expect(parseKirkstagramGallery('<html><body>없음</body></html>')).toEqual([]);
		expect(parseKirkstagramGallery('<script id="discord:component-embed">{not json</script>')).toEqual([]);
	});
});

describe('mergeInstagramMeta', () => {
	it('merges kirk media with the toig caption and splits the video out', () => {
		const merged = mergeInstagramMeta(
			{ author: '@girlgangcraft', media: ['https://kirkstagram.com/images/Dd9mHhJIMz9/1', 'https://kirkstagram.com/videos/Dd9mHhJIMz9/7'] },
			{ author: '@girlgangcraft', caption: '캡션', media: ['https://toinstagram.com/videos/Dd9mHhJIMz9/1'] }
		);
		expect(merged).toEqual({
			author: '@girlgangcraft',
			caption: '캡션',
			images: ['https://kirkstagram.com/images/Dd9mHhJIMz9/1'],
			videoUrl: 'https://kirkstagram.com/videos/Dd9mHhJIMz9/7'
		});
	});

	it('uses the toig media when kirk has no carousel', () => {
		const merged = mergeInstagramMeta(null, { author: '@arabnews', caption: null, media: ['https://toinstagram.com/videos/Dd-y-P_CfZN/1'] });
		expect(merged?.videoUrl).toBe('https://toinstagram.com/videos/Dd-y-P_CfZN/1');
		expect(merged?.images).toEqual([]);
	});

	it('returns null when both sides are empty', () => {
		expect(mergeInstagramMeta(null, null)).toBeNull();
		expect(mergeInstagramMeta({ author: null, media: [] }, null)).toBeNull();
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

const TIKTOK_LINK = {
	site: 'tiktok',
	url: 'https://www.tiktok.com/@khaby.lame/video/7483143881148665110',
	fixedUrl: 'https://tnktok.com/@khaby.lame/video/7483143881148665110'
} as const;
const REDDIT_LINK = {
	site: 'reddit',
	url: 'https://www.reddit.com/r/jobs/comments/1wsezqo/',
	fixedUrl: 'https://vxreddit.com/r/jobs/comments/1wsezqo/'
} as const;

describe('ogEmbedFixResult', () => {
	it('maps og meta with a video to a card (TikTok)', () => {
		const result = ogEmbedFixResult(
			TIKTOK_LINK,
			{
				title: 'Khabane lame (@khaby.lame)',
				description: '영상 설명',
				image: 'https://example.com/thumb.jpg',
				video: 'https://offload.tnktok.com/generate/video/7483143881148665110.mp4',
				url: TIKTOK_LINK.url
			},
			TIKTOK_LINK.fixedUrl
		);
		expect(result.site).toBe('tiktok');
		expect(result.mode).toBe('card');
		if (result.mode !== 'card') return;
		expect(result.title).toBe('Khabane lame (@khaby.lame)');
		expect(result.description).toBe('영상 설명');
		expect(result.images).toEqual(['https://example.com/thumb.jpg']);
		expect(result.videoUrl).toBe('https://offload.tnktok.com/generate/video/7483143881148665110.mp4');
		expect(result.sourceUrl).toBe(TIKTOK_LINK.url);
	});

	it('maps a text-only og meta to a card without images (Reddit)', () => {
		const result = ogEmbedFixResult(
			REDDIT_LINK,
			{ title: '게시물 제목', description: '본문 요약', image: null, video: null, url: REDDIT_LINK.url },
			REDDIT_LINK.fixedUrl
		);
		expect(result.mode).toBe('card');
		if (result.mode !== 'card') return;
		expect(result.title).toBe('게시물 제목');
		expect(result.images).toBeUndefined();
		expect(result.videoUrl).toBeUndefined();
		expect(result.sourceUrl).toBe(REDDIT_LINK.url);
	});

	it('falls back to the swapped link when og meta is unavailable', () => {
		const result = ogEmbedFixResult(TIKTOK_LINK, null, TIKTOK_LINK.fixedUrl);
		expect(result.mode).toBe('link');
		if (result.mode !== 'link') return;
		expect(result.fixedUrl).toBe(TIKTOK_LINK.fixedUrl);
	});

	it('falls back to the caller fixedUrl when even the swap misses', () => {
		const result = ogEmbedFixResult(
			{ site: 'pixiv', url: 'https://www.pixiv.net/artworks/1', fixedUrl: 'https://www.phixiv.net/artworks/1' },
			null,
			null
		);
		expect(result.mode).toBe('link');
		if (result.mode !== 'link') return;
		expect(result.fixedUrl).toBe('https://www.phixiv.net/artworks/1');
	});
});
