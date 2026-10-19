import { describe, expect, it } from 'vitest';
import {
	COUNTING_STATE_DEFAULT,
	EMBED_FIX_MAX_DESCRIPTION,
	EMOJI_ENLARGE_MAX,
	evaluateCounting,
	findEmbedFixLinks,
	normalizeEmbedFixSites,
	parseBoothOg,
	parseCountingMessage,
	parseEmojiOnlyMessage,
	parseMessageLinks,
	customEmojiUrl,
	enlargeBoothImage,
	enlargeTwitterAvatar,
	enlargeTwitterPhoto,
	embedFixMetadataRequestSchema,
	embedFixMetadataResponseSchema,
	embedFixResultSchema,
	fxTwitterApiUrl,
	parseFxTwitterStatus,
	parseOgMeta,
	swapEmbedFixUrl
} from './chatTools.ts';

describe('parseEmojiOnlyMessage', () => {
	it('커스텀 이모지 하나만 있으면 확대 대상이에요', () => {
		expect(parseEmojiOnlyMessage('<:pepe:123456789012345678>')).toEqual([{ id: '123456789012345678', name: 'pepe', animated: false }]);
	});

	it('공백으로 구분된 여러 커스텀 이모지도 인정해요', () => {
		const result = parseEmojiOnlyMessage('<:a:111111111111111111> <:b:222222222222222222>  <a:c:333333333333333333>');
		expect(result).toEqual([
			{ id: '111111111111111111', name: 'a', animated: false },
			{ id: '222222222222222222', name: 'b', animated: false },
			{ id: '333333333333333333', name: 'c', animated: true }
		]);
	});

	it('텍스트가 섞이거나 유니코드 이모지만 있으면 null이에요', () => {
		expect(parseEmojiOnlyMessage('hello <:pepe:123456789012345678>')).toBeNull();
		expect(parseEmojiOnlyMessage('<:pepe:123456789012345678> 잘생겼다')).toBeNull();
		expect(parseEmojiOnlyMessage('😀 😀')).toBeNull();
		expect(parseEmojiOnlyMessage('')).toBeNull();
		expect(parseEmojiOnlyMessage('   ')).toBeNull();
	});

	it(`최대 ${EMOJI_ENLARGE_MAX}개까지만 인정해요`, () => {
		const eleven = Array.from({ length: EMOJI_ENLARGE_MAX + 1 }, () => '<:pepe:123456789012345678>').join(' ');
		expect(parseEmojiOnlyMessage(eleven)).toBeNull();
		const ten = Array.from({ length: EMOJI_ENLARGE_MAX }, () => '<:pepe:123456789012345678>').join(' ');
		expect(parseEmojiOnlyMessage(ten)).toHaveLength(EMOJI_ENLARGE_MAX);
	});
});

describe('customEmojiUrl', () => {
	it('정적 이모지는 png, 애니메이션은 gif URL을 만들어요', () => {
		expect(customEmojiUrl({ id: '123', name: 'a', animated: false })).toBe('https://cdn.discordapp.com/emojis/123.png?size=512&quality=lossless');
		expect(customEmojiUrl({ id: '456', name: 'b', animated: true }, 1024)).toBe(
			'https://cdn.discordapp.com/emojis/456.gif?size=1024&quality=lossless'
		);
	});
});

describe('parseMessageLinks', () => {
	it('discord.com 메시지 링크를 뽑아요', () => {
		expect(parseMessageLinks('보세요 https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333')).toEqual([
			{ guildId: '111111111111111111', channelId: '222222222222222222', messageId: '333333333333333333' }
		]);
	});

	it('ptb/canary/www 변형도 인정해요', () => {
		expect(parseMessageLinks('https://ptb.discord.com/channels/111111111111111111/222222222222222222/333333333333333333')).toHaveLength(1);
		expect(parseMessageLinks('https://canary.discord.com/channels/111111111111111111/222222222222222222/333333333333333333')).toHaveLength(1);
		expect(parseMessageLinks('https://discord.com/channels/111111111111111111/222222222222222222/345678901234567890')).toHaveLength(1);
	});

	it('감싼 링크(<...>)는 건너뛰고 중복은 제거해요', () => {
		expect(parseMessageLinks('<https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333>')).toEqual([]);
		const twice =
			'https://discord.com/channels/111111111111111111/222222222222222222/333333333333333333 그리고 https://discord.com/channels/999999999999999999/999999999999999999/333333333333333333';
		expect(parseMessageLinks(twice)).toHaveLength(1);
		expect(parseMessageLinks(twice)[0].messageId).toBe('333333333333333333');
	});
});

describe('normalizeEmbedFixSites', () => {
	it('값이 없으면 비활성(빈 배열)이에요 — 기본은 전부 꺼짐', () => {
		expect(normalizeEmbedFixSites(null)).toEqual([]);
		expect(normalizeEmbedFixSites(undefined)).toEqual([]);
	});

	it('모르는 사이트는 걸러내고 중복을 제거해요', () => {
		expect(normalizeEmbedFixSites(['x', 'x', 'facebook', 'booth'])).toEqual(['x', 'booth']);
		expect(normalizeEmbedFixSites([])).toEqual([]);
	});
});

describe('findEmbedFixLinks', () => {
	it('twitter.com 링크는 fxtwitter.com으로, x.com 링크는 fixupx.com으로 바꿔요', () => {
		const [twitter] = findEmbedFixLinks('https://twitter.com/user/status/1234567890123456789', ['x']);
		expect(twitter).toEqual({
			site: 'x',
			original: 'https://twitter.com/user/status/1234567890123456789',
			fixed: 'https://fxtwitter.com/user/status/1234567890123456789'
		});
		const [x] = findEmbedFixLinks('https://x.com/user/status/1234567890123456789?s=20', ['x']);
		expect(x?.site === 'x' && x.fixed).toBe('https://fixupx.com/user/status/1234567890123456789');
	});

	it('photo 접미사는 유지하고 감싼 링크는 건너뛰어요', () => {
		const [photo] = findEmbedFixLinks('https://x.com/user/status/123/photo/1)', ['x']);
		expect(photo?.site === 'x' && photo.fixed).toBe('https://fixupx.com/user/status/123/photo/1');
		expect(findEmbedFixLinks('<https://x.com/user/status/123>', ['x'])).toEqual([]);
	});

	it('인스타그램 링크는 프로바이더 도메인으로 바꿔요', () => {
		const [reel] = findEmbedFixLinks('https://www.instagram.com/reel/DQAXKSAkgcO/?igsh=abc', ['instagram']);
		expect(reel).toEqual({
			site: 'instagram',
			original: 'https://www.instagram.com/reel/DQAXKSAkgcO/',
			fixed: 'https://kkinstagram.com/reel/DQAXKSAkgcO/'
		});
	});

	it('BOOTH 링크는 원본 주소를 돌려줘요 (자체 OG 임베드용)', () => {
		const [booth] = findEmbedFixLinks('https://booth.pm/ko/items/8711621', ['booth']);
		expect(booth).toEqual({ site: 'booth', original: 'https://booth.pm/ko/items/8711621' });
		const [shop] = findEmbedFixLinks('https://shopname.booth.pm/items/123', ['booth']);
		expect(shop).toEqual({ site: 'booth', original: 'https://shopname.booth.pm/items/123' });
	});

	it('유사 도메인(thetwitter.com)은 오탐하지 않아요', () => {
		expect(findEmbedFixLinks('https://thetwitter.com/user/status/123', ['x'])).toEqual([]);
		expect(findEmbedFixLinks('https://notdiscord.com/channels/1/2/3', ['x'])).toEqual([]);
	});

	it('비활성 사이트는 무시하고 최대 개수를 지켜요', () => {
		expect(findEmbedFixLinks('https://x.com/user/status/1234567890123456789', [])).toEqual([]);
		expect(
			findEmbedFixLinks(
				'https://x.com/user/status/1234567890123456789 https://x.com/other/status/2234567890123456789 https://x.com/third/status/3234567890123456789',
				['x']
			)
		).toHaveLength(2);
	});

	it('TikTok·Reddit·Pixiv·Threads 링크를 고친 주소로 바꿔요', () => {
		const [tiktok] = findEmbedFixLinks('https://www.tiktok.com/@khaby.lame/video/7483143881148665110', ['tiktok']);
		expect(tiktok).toEqual({
			site: 'tiktok',
			original: 'https://www.tiktok.com/@khaby.lame/video/7483143881148665110',
			fixed: 'https://tnktok.com/@khaby.lame/video/7483143881148665110'
		});
		const [reddit] = findEmbedFixLinks('https://www.reddit.com/r/jobs/comments/1wsezqo/giving_a_twoweek_notice/', ['reddit']);
		expect(reddit).toEqual({
			site: 'reddit',
			original: 'https://www.reddit.com/r/jobs/comments/1wsezqo/giving_a_twoweek_notice',
			fixed: 'https://vxreddit.com/r/jobs/comments/1wsezqo/giving_a_twoweek_notice/'
		});
		const [pixiv] = findEmbedFixLinks('https://www.pixiv.net/en/artworks/150944479', ['pixiv']);
		expect(pixiv).toEqual({
			site: 'pixiv',
			original: 'https://www.pixiv.net/en/artworks/150944479',
			fixed: 'https://www.phixiv.net/en/artworks/150944479'
		});
		const [threads] = findEmbedFixLinks('https://www.threads.net/@dhruboahmed071/post/DdmvmJBkz7h', ['threads']);
		expect(threads).toEqual({
			site: 'threads',
			original: 'https://www.threads.net/@dhruboahmed071/post/DdmvmJBkz7h',
			fixed: 'https://fixthreads.seria.moe/@dhruboahmed071/post/DdmvmJBkz7h'
		});
	});

	it('TikTok·Reddit·Pixiv·Threads 유사 도메인·비게시물 링크는 오탐하지 않아요', () => {
		expect(findEmbedFixLinks('https://notiktok.com/@user/video/123', ['tiktok'])).toEqual([]);
		expect(findEmbedFixLinks('https://vt.tiktok.com/@user/video/123456789012', ['tiktok'])).toEqual([]);
		expect(findEmbedFixLinks('https://www.tiktok.com/explore', ['tiktok'])).toEqual([]);
		expect(findEmbedFixLinks('https://www.reddit.com/r/jobs', ['reddit'])).toEqual([]);
		expect(findEmbedFixLinks('https://www.pixiv.net/en/users/123', ['pixiv'])).toEqual([]);
		expect(findEmbedFixLinks('https://www.threads.net/@user', ['threads'])).toEqual([]);
	});

	it('한 메시지에서 여러 사이트 링크를 계약 순서로 뽑아요', () => {
		const links = findEmbedFixLinks(
			'https://www.pixiv.net/artworks/150944479 그리고 https://www.tiktok.com/@khaby.lame/photo/7483143881148665110',
			['pixiv', 'tiktok']
		);
		expect(links.map((link) => link.site)).toEqual(['tiktok', 'pixiv']);
	});
});

describe('parseBoothOg', () => {
	const html = `
		<html><head>
		<meta property="og:type" content="product" />
		<meta property="og:title" content="&amp;특별 상품&quot;" />
		<meta property="og:description" content="${'아'.repeat(EMBED_FIX_MAX_DESCRIPTION + 10)}" />
		<meta property="og:image" content="https://booth.pximg.net/c/620x620/uuid/i/123/uuid_base_resized.jpg" />
		<meta property="og:url" content="https://booth.pm/ko/items/8711621" />
		</head></html>`;

	it('OG 메타를 읽어 설명을 자르고 이미지를 원본 해상도로 바꿔요', () => {
		const meta = parseBoothOg(html, 'https://booth.pm/ko/items/8711621');
		expect(meta).not.toBeNull();
		expect(meta?.title).toBe('&특별 상품"');
		expect(meta?.description).toHaveLength(EMBED_FIX_MAX_DESCRIPTION);
		expect(meta?.description.endsWith('…')).toBe(true);
		expect(meta?.image).toBe('https://booth.pximg.net/uuid/i/123/uuid_base_resized.jpg');
		expect(meta?.url).toBe('https://booth.pm/ko/items/8711621');
	});

	it('title이나 image가 없으면 null이에요', () => {
		expect(parseBoothOg('<html><meta property="og:title" content="제목만"></html>', 'https://booth.pm/ko/items/1')).toBeNull();
		expect(parseBoothOg('no meta at all', 'https://booth.pm/ko/items/1')).toBeNull();
	});
});

describe('enlargeBoothImage', () => {
	it('pximg 리사이즈 세그먼트를 제거해요', () => {
		expect(enlargeBoothImage('https://booth.pximg.net/c/620x620/a/i/1/b.jpg')).toBe('https://booth.pximg.net/a/i/1/b.jpg');
		expect(enlargeBoothImage('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
	});
});

describe('swapEmbedFixUrl', () => {
	it('원본 주소에서 고친 주소를 다시 계산해요', () => {
		expect(swapEmbedFixUrl('tiktok', 'https://www.tiktok.com/@khaby.lame/video/7483143881148665110')).toBe(
			'https://tnktok.com/@khaby.lame/video/7483143881148665110'
		);
		expect(swapEmbedFixUrl('reddit', 'https://www.reddit.com/r/jobs/comments/1wsezqo/')).toBe('https://vxreddit.com/r/jobs/comments/1wsezqo/');
		expect(swapEmbedFixUrl('x', 'https://twitter.com/user/status/123')).toBe('https://fxtwitter.com/user/status/123');
	});

	it('패턴이 안 맞거나 BOOTH면 null이에요', () => {
		expect(swapEmbedFixUrl('booth', 'https://booth.pm/ko/items/123')).toBeNull();
		expect(swapEmbedFixUrl('tiktok', 'https://example.com/not-tiktok')).toBeNull();
	});
});

describe('parseOgMeta', () => {
	it('og 메타를 읽고 image·video·url을 채워요', () => {
		const html = `
			<html><head>
			<meta property="og:title" content="Khabane lame (@khaby.lame)" />
			<meta property="og:description" content="영상 설명" />
			<meta property="og:image" content="https://example.com/thumb.jpg" />
			<meta property="og:video" content="https://offload.tnktok.com/generate/video/123.mp4" />
			<meta property="og:url" content="https://www.tiktok.com/@khaby.lame/video/123" />
			</head></html>`;
		const meta = parseOgMeta(html, 'https://fallback.example');
		expect(meta).toEqual({
			title: 'Khabane lame (@khaby.lame)',
			description: '영상 설명',
			image: 'https://example.com/thumb.jpg',
			video: 'https://offload.tnktok.com/generate/video/123.mp4',
			url: 'https://www.tiktok.com/@khaby.lame/video/123'
		});
	});

	it('image·video·og:url이 없으면 null과 pageUrl로 채워요', () => {
		const meta = parseOgMeta('<html><meta property="og:title" content="제목만"></html>', 'https://example.com/page');
		expect(meta).toEqual({ title: '제목만', description: '', image: null, video: null, url: 'https://example.com/page' });
	});

	it('title이 없으면 null, description은 잘라요', () => {
		expect(parseOgMeta('<html><meta property="og:image" content="https://example.com/a.jpg"></html>', 'https://example.com')).toBeNull();
		const meta = parseOgMeta(
			`<html><meta property="og:title" content="제목"><meta property="og:description" content="${'나'.repeat(EMBED_FIX_MAX_DESCRIPTION + 10)}"></html>`,
			'https://example.com'
		);
		expect(meta?.description).toHaveLength(EMBED_FIX_MAX_DESCRIPTION);
		expect(meta?.description.endsWith('…')).toBe(true);
	});
});

describe('parseCountingMessage', () => {
	it('숫자만 인정해요', () => {
		expect(parseCountingMessage('42')).toBe(42);
		expect(parseCountingMessage(' 7 ')).toBe(7);
		expect(parseCountingMessage('4 2')).toBeNull();
		expect(parseCountingMessage('4,000')).toBeNull();
		expect(parseCountingMessage('hello')).toBeNull();
		expect(parseCountingMessage('1234567890123456')).toBeNull();
	});
});

describe('evaluateCounting', () => {
	it('정확히 다음 숫자면 성공하고 상태를 갱신해요', () => {
		const result = evaluateCounting({ current: 3, lastUserId: 'a', best: 5 }, 4, 'b');
		expect(result).toEqual({ ok: true, state: { current: 4, lastUserId: 'b', best: 5 }, reset: false, newBest: false });
	});

	it('같은 사람이 연속으로 세면 실패하고 초기화해요', () => {
		const result = evaluateCounting({ current: 4, lastUserId: 'b', best: 5 }, 5, 'b');
		expect(result.ok).toBe(false);
		expect(result.state).toEqual({ current: 0, lastUserId: null, best: 5 });
		expect(result.reset).toBe(true);
	});

	it('틀린 숫자도 실패해요', () => {
		const result = evaluateCounting({ current: 4, lastUserId: 'b', best: 4 }, 9, 'a');
		expect(result.ok).toBe(false);
		expect(result.reset).toBe(true);
	});

	it('이미 0인 상태의 실패는 리셋 안내를 하지 않아요', () => {
		const result = evaluateCounting(COUNTING_STATE_DEFAULT, 5, 'a');
		expect(result.ok).toBe(false);
		expect(result.reset).toBe(false);
	});

	it('기록을 갱신하면 newBest를 알려줘요', () => {
		const first = evaluateCounting(COUNTING_STATE_DEFAULT, 1, 'a');
		expect(first.ok).toBe(true);
		expect(first.newBest).toBe(true);
		const second = evaluateCounting(first.state, 2, 'b');
		expect(second.newBest).toBe(true);
		const third = evaluateCounting({ current: 2, lastUserId: 'b', best: 10 }, 3, 'c');
		expect(third.newBest).toBe(false);
		expect(third.state.best).toBe(10);
	});
});

describe('fxTwitterApiUrl', () => {
	it('twitter.com·x.com 링크를 FxEmbed API 주소로 바꿔요 (경로 유지)', () => {
		expect(fxTwitterApiUrl('https://twitter.com/jack/status/20')).toBe('https://api.fxtwitter.com/jack/status/20');
		expect(fxTwitterApiUrl('https://x.com/jack/status/20')).toBe('https://api.fxtwitter.com/jack/status/20');
		expect(fxTwitterApiUrl('https://www.twitter.com/jack/status/20?s=20')).toBe('https://api.fxtwitter.com/jack/status/20?s=20');
		expect(fxTwitterApiUrl('twitter.com/jack/status/20')).toBe('https://api.fxtwitter.com/jack/status/20');
	});

	it('X 링크가 아니면 null이에요', () => {
		expect(fxTwitterApiUrl('https://fxtwitter.com/jack/status/20')).toBeNull();
		expect(fxTwitterApiUrl('https://instagram.com/p/abc123')).toBeNull();
		expect(fxTwitterApiUrl('https://example.com/twitter.com/x')).toBeNull();
	});
});

describe('enlargeTwitterPhoto·enlargeTwitterAvatar', () => {
	it('사진 name 파라미터를 large로 정규화해요', () => {
		expect(enlargeTwitterPhoto('https://pbs.twimg.com/media/Abc123?format=jpg&name=small')).toBe(
			'https://pbs.twimg.com/media/Abc123?format=jpg&name=large'
		);
		expect(enlargeTwitterPhoto('https://pbs.twimg.com/media/Abc123?format=jpg')).toBe('https://pbs.twimg.com/media/Abc123?format=jpg');
	});

	it('아바타 변형을 400x400으로 키워요', () => {
		expect(enlargeTwitterAvatar('https://pbs.twimg.com/profile_images/123/abc_normal.jpg')).toBe(
			'https://pbs.twimg.com/profile_images/123/abc_400x400.jpg'
		);
		expect(enlargeTwitterAvatar('https://pbs.twimg.com/profile_images/123/abc_200x200.jpg')).toBe(
			'https://pbs.twimg.com/profile_images/123/abc_400x400.jpg'
		);
		expect(enlargeTwitterAvatar('https://pbs.twimg.com/profile_images/123/abc_400x400.jpg')).toBe(
			'https://pbs.twimg.com/profile_images/123/abc_400x400.jpg'
		);
	});
});

// 실측 기반 fixture — api.fxtwitter.com/jack/status/20 (2026-10-19 라이브 응답)
const JACK_STATUS_PAYLOAD = {
	code: 200,
	message: 'OK',
	tweet: {
		url: 'https://twitter.com/jack/status/20',
		text: 'just setting up my twttr',
		author: { name: 'jack', screen_name: 'jack', avatar_url: 'https://pbs.twimg.com/profile_images/123/abc_200x200.jpg' },
		replies: 120,
		retweets: 34,
		likes: 560,
		created_timestamp: 1142974214,
		media: {
			photos: [{ type: 'photo', url: 'https://pbs.twimg.com/media/Abc123?format=jpg&name=small', width: 1200, height: 800 }]
		}
	}
};

describe('parseFxTwitterStatus', () => {
	it('v1 래퍼(tweet)를 파싱해요 — 사진 name=large·아바타 400x400 정규화', () => {
		const status = parseFxTwitterStatus(JACK_STATUS_PAYLOAD);
		expect(status).toEqual({
			url: 'https://twitter.com/jack/status/20',
			text: 'just setting up my twttr',
			authorName: 'jack',
			authorHandle: 'jack',
			authorAvatar: 'https://pbs.twimg.com/profile_images/123/abc_400x400.jpg',
			photos: ['https://pbs.twimg.com/media/Abc123?format=jpg&name=large'],
			hasVideo: false,
			hasPoll: false,
			hasQuote: false,
			replyCount: 120,
			retweetCount: 34,
			likeCount: 560,
			createdAt: 1142974214
		});
	});

	it('v2 래퍼(status)와 reposts 필드도 받아들여요', () => {
		const status = parseFxTwitterStatus({
			code: 200,
			status: { ...JACK_STATUS_PAYLOAD.tweet, retweets: undefined, reposts: 77 }
		});
		expect(status?.retweetCount).toBe(77);
	});

	it('code가 200이 아니거나 트윗이 없으면 null이에요', () => {
		expect(parseFxTwitterStatus({ code: 404, message: 'Not Found' })).toBeNull();
		expect(parseFxTwitterStatus({ code: 200 })).toBeNull();
		expect(parseFxTwitterStatus('nope')).toBeNull();
	});

	it('동영상·GIF·external 미디어는 hasVideo로 알려줘요', () => {
		const withVideo = parseFxTwitterStatus({
			code: 200,
			tweet: { ...JACK_STATUS_PAYLOAD.tweet, media: { videos: [{ type: 'video', url: 'https://video.twimg.com/x.mp4' }] } }
		});
		expect(withVideo?.hasVideo).toBe(true);
		const withExternal = parseFxTwitterStatus({
			code: 200,
			tweet: { ...JACK_STATUS_PAYLOAD.tweet, media: { external: { url: 'https://youtube.com/watch?v=x' } } }
		});
		expect(withExternal?.hasVideo).toBe(true);
	});

	it('photo가 아니거나 url이 이상한 미디어는 건너뛰어요', () => {
		const status = parseFxTwitterStatus({
			code: 200,
			tweet: {
				...JACK_STATUS_PAYLOAD.tweet,
				media: {
					photos: [
						{ type: 'gif', url: 'https://pbs.twimg.com/media/x?format=gif&name=small' },
						{ type: 'photo', url: 'javascript:alert(1)' }
					]
				}
			}
		});
		expect(status?.photos).toEqual([]);
	});

	it('숫자가 아닌 카운트는 0으로 돌려줘요', () => {
		const status = parseFxTwitterStatus({ code: 200, tweet: { ...JACK_STATUS_PAYLOAD.tweet, replies: 'n/a', likes: undefined } });
		expect(status?.replyCount).toBe(0);
		expect(status?.likeCount).toBe(0);
	});
});

describe('임베드 복구 게이트웨이 스키마', () => {
	it('요청 스키마는 site·url·fixedUrl을 검증해요', () => {
		const ok = embedFixMetadataRequestSchema.safeParse({
			links: [
				{ site: 'x', url: 'https://x.com/jack/status/20', fixedUrl: 'https://fixupx.com/jack/status/20' },
				{ site: 'booth', url: 'https://booth.pm/ko/items/8711621' }
			]
		});
		expect(ok.success).toBe(true);

		expect(embedFixMetadataRequestSchema.safeParse({ links: [] }).success).toBe(false);
		expect(
			embedFixMetadataRequestSchema.safeParse({ links: [{ site: 'tiktok', url: 'https://www.tiktok.com/@user/video/1234567890123456789' }] })
				.success
		).toBe(true);
		expect(embedFixMetadataRequestSchema.safeParse({ links: [{ site: 'facebook', url: 'https://facebook.com/x' }] }).success).toBe(false);
		expect(embedFixMetadataRequestSchema.safeParse({ links: [{ site: 'x', url: 'not-a-url' }] }).success).toBe(false);
	});

	it('결과 스키마는 모드별 카드/링크 필드를 받아들여요', () => {
		const card = embedFixResultSchema.safeParse({
			site: 'x',
			mode: 'card',
			authorName: 'jack',
			authorHandle: 'jack',
			authorAvatar: 'https://pbs.twimg.com/profile_images/123/abc_400x400.jpg',
			description: 'just setting up my twttr',
			images: ['https://pbs.twimg.com/media/Abc123?format=jpg&name=large'],
			replyCount: 120,
			retweetCount: 34,
			likeCount: 560,
			createdAt: 1142974214,
			sourceUrl: 'https://twitter.com/jack/status/20'
		});
		expect(card.success).toBe(true);

		const link = embedFixResultSchema.safeParse({ site: 'instagram', mode: 'link', fixedUrl: 'https://www.kkinstagram.com/p/abc123/' });
		expect(link.success).toBe(true);

		const skip = embedFixResultSchema.safeParse({ site: 'booth', mode: 'skip' });
		expect(skip.success).toBe(true);

		const videoCard = embedFixResultSchema.safeParse({
			site: 'tiktok',
			mode: 'card',
			title: 'Khabane lame (@khaby.lame)',
			videoUrl: 'https://offload.tnktok.com/generate/video/7483143881148665110.mp4',
			sourceUrl: 'https://www.tiktok.com/@khaby.lame/video/7483143881148665110'
		});
		expect(videoCard.success).toBe(true);

		expect(embedFixResultSchema.safeParse({ site: 'x', mode: 'bogus' }).success).toBe(false);
	});

	it('응답 스키마는 results 배열을 감싸요', () => {
		const ok = embedFixMetadataResponseSchema.safeParse({
			results: [{ site: 'x', mode: 'link', fixedUrl: 'https://fxtwitter.com/jack/status/20' }]
		});
		expect(ok.success).toBe(true);
		expect(embedFixMetadataResponseSchema.safeParse({ results: 'nope' }).success).toBe(false);
	});
});
