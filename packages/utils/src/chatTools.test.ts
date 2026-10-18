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
	enlargeBoothImage
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
	it('값이 없으면 전체 사이트 기본값이에요', () => {
		expect(normalizeEmbedFixSites(null)).toEqual(['x', 'instagram', 'booth']);
		expect(normalizeEmbedFixSites(undefined)).toEqual(['x', 'instagram', 'booth']);
	});

	it('모르는 사이트는 걸러내고 중복을 제거해요', () => {
		expect(normalizeEmbedFixSites(['x', 'x', 'tiktok', 'booth'])).toEqual(['x', 'booth']);
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
		expect(x?.fixed).toBe('https://fixupx.com/user/status/1234567890123456789');
	});

	it('photo 접미사는 유지하고 감싼 링크는 건너뛰어요', () => {
		const [photo] = findEmbedFixLinks('https://x.com/user/status/123/photo/1)', ['x']);
		expect(photo?.fixed).toBe('https://fixupx.com/user/status/123/photo/1');
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
