import { describe, expect, it } from 'vitest';
import {
	DISCORD_CONTENT_MAX_LENGTH,
	SOCIAL_TEMPLATE_VARIABLES,
	extractSocialTemplateRoleIds,
	renderSocialContent,
	socialEventSchema,
	socialMessageTemplateSchema,
	socialPlatformSchema,
	socialSubscriptionCreateSchema,
	socialSubscriptionStatusSchema,
	socialSubscriptionUpdateSchema,
	socialTemplateIssue,
	socialWebhookAvatarUrlSchema,
	socialWebhookCreateRequestSchema,
	socialWebhookCreateResponseSchema,
	socialWebhookNameSchema,
	type SocialEvent
} from './social.ts';

const REQUEST_ID = 'd7a1f3c5-2b8e-4a9d-8f61-3c2b5e7a9d41';
const GUILD_ID = '123456789012345678';
const CHANNEL_ID = '987654321098765432';
const ROLE_ID = '192837465051627384';

const EVENT: SocialEvent = {
	platform: 'chzzk',
	sourceId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
	contentId: 'live_12345',
	title: '방송 시작했어요!',
	url: 'https://chzzk.naver.com/live/12345',
	thumbnail: 'https://image.example.com/thumb.jpg',
	author: '시루',
	publishedAt: Date.now()
};

describe('social platform contract', () => {
	it('accepts the three supported platforms', () => {
		for (const platform of ['youtube', 'chzzk', 'twitch'] as const) {
			expect(socialPlatformSchema.safeParse(platform).success).toBe(true);
		}
	});

	it('rejects an unknown platform', () => {
		expect(socialPlatformSchema.safeParse('instagram').success).toBe(false);
	});

	it('exposes exactly the template variables', () => {
		expect([...SOCIAL_TEMPLATE_VARIABLES]).toEqual(['title', 'url', 'author']);
	});
});

describe('socialEventSchema', () => {
	it('roundtrips a normalized event', () => {
		const result = socialEventSchema.safeParse(EVENT);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.contentId).toBe('live_12345');
			expect(result.data.platform).toBe('chzzk');
		}
	});

	it('allows a null thumbnail', () => {
		const result = socialEventSchema.safeParse({ ...EVENT, thumbnail: null });
		expect(result.success).toBe(true);
	});

	it('rejects a non-url url field', () => {
		expect(socialEventSchema.safeParse({ ...EVENT, url: 'not-a-url' }).success).toBe(false);
	});

	it('rejects a non-positive publishedAt', () => {
		expect(socialEventSchema.safeParse({ ...EVENT, publishedAt: -1 }).success).toBe(false);
	});
});

describe('socialTemplateIssue', () => {
	it('passes a template with every variable and mention tokens', () => {
		const template = `🔔 {author} 방송 시작! {title} <#${CHANNEL_ID}> <@&${ROLE_ID}>`;
		expect(socialTemplateIssue(template)).toBeNull();
	});

	it('passes a literal unterminated brace', () => {
		expect(socialTemplateIssue('수학 문제: a{b')).toBeNull();
	});

	it('rejects an unknown variable', () => {
		expect(socialTemplateIssue('{nope}')).toContain('알 수 없는 변수');
	});

	it('rejects @everyone and @here', () => {
		expect(socialTemplateIssue('@everyone 모여라')).toContain('@everyone');
		expect(socialTemplateIssue('다들 <@here>')).toContain('@everyone');
	});

	it('does not reject words that merely contain @here', () => {
		expect(socialTemplateIssue('이건 @HereWeGo 계정 얘기야')).toBeNull();
	});

	it('rejects a user mention token', () => {
		expect(socialTemplateIssue(`<@${CHANNEL_ID}>`)).toContain('사용자 멘션');
	});

	it('rejects a malformed channel mention', () => {
		expect(socialTemplateIssue('<#abc>')).toContain('채널 멘션 형식');
	});

	it('rejects a malformed role mention', () => {
		expect(socialTemplateIssue('<@&role-id>')).toContain('역할 멘션 형식');
	});

	it('rejects a custom emoji token', () => {
		expect(socialTemplateIssue('<:siru:123456789012345678>')).toContain('커스텀 이모지');
	});

	it('rejects an over-length template', () => {
		expect(socialTemplateIssue('a'.repeat(1001))).toContain('1000자');
	});
});

describe('renderSocialContent', () => {
	it('substitutes variables and keeps mention tokens raw', () => {
		const template = `{author}이(가) {title} 올림 <@&${ROLE_ID}>`;
		expect(renderSocialContent(template, EVENT)).toBe(`시루이(가) 방송 시작했어요! 올림 <@&${ROLE_ID}>`);
	});

	it('clamps the rendered result to the discord content limit', () => {
		const longEvent: SocialEvent = { ...EVENT, title: 'x'.repeat(2500) };
		const rendered = renderSocialContent('{title}', longEvent);
		expect(rendered.length).toBe(DISCORD_CONTENT_MAX_LENGTH);
		expect(rendered.endsWith('…')).toBe(true);
	});
});

describe('extractSocialTemplateRoleIds', () => {
	it('returns unique role ids only', () => {
		const template = `<@&${ROLE_ID}> <@&${ROLE_ID}> <#${CHANNEL_ID}> <@&${GUILD_ID}>`;
		expect(extractSocialTemplateRoleIds(template)).toEqual([ROLE_ID, GUILD_ID]);
	});

	it('returns an empty list when no role mention exists', () => {
		expect(extractSocialTemplateRoleIds(`역할 없음 <#${CHANNEL_ID}>`)).toEqual([]);
	});
});

describe('socialMessageTemplateSchema', () => {
	it('trims and accepts a valid template', () => {
		const result = socialMessageTemplateSchema.safeParse('  {title} 올라옴  ');
		expect(result.success).toBe(true);
		if (result.success) expect(result.data).toBe('{title} 올라옴');
	});

	it('rejects an empty template', () => {
		expect(socialMessageTemplateSchema.safeParse('   ').success).toBe(false);
	});

	it('surfaces the template issue as the failure message', () => {
		const result = socialMessageTemplateSchema.safeParse('{oops}');
		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.issues[0]?.message).toContain('알 수 없는 변수');
	});
});

describe('socialSubscriptionStatusSchema', () => {
	it('accepts the three statuses', () => {
		for (const status of ['active', 'failed', 'disabled'] as const) {
			expect(socialSubscriptionStatusSchema.safeParse(status).success).toBe(true);
		}
	});
});

describe('socialSubscriptionCreateSchema', () => {
	it('accepts a full create body', () => {
		const result = socialSubscriptionCreateSchema.safeParse({
			guildId: GUILD_ID,
			platform: 'chzzk',
			sourcePlatformId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
			sourceName: '시루',
			targetChannelId: CHANNEL_ID,
			messageTemplate: `{author} 방송 시작! <@&${ROLE_ID}>`
		});
		expect(result.success).toBe(true);
	});

	it('accepts a body without a template', () => {
		const result = socialSubscriptionCreateSchema.safeParse({
			guildId: GUILD_ID,
			platform: 'youtube',
			sourcePlatformId: 'UCxxxxxxxxxxxxxxxxxxxxxx',
			sourceName: '시루 채널',
			targetChannelId: CHANNEL_ID
		});
		expect(result.success).toBe(true);
	});

	it('accepts webhook display overrides and null defaults', () => {
		const withDisplay = socialSubscriptionCreateSchema.safeParse({
			guildId: GUILD_ID,
			platform: 'chzzk',
			sourcePlatformId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
			sourceName: '시루',
			targetChannelId: CHANNEL_ID,
			webhookName: '시루 알림봇',
			webhookAvatarUrl: 'https://cdn.example.com/avatar.png'
		});
		expect(withDisplay.success).toBe(true);

		const withNulls = socialSubscriptionCreateSchema.safeParse({
			guildId: GUILD_ID,
			platform: 'chzzk',
			sourcePlatformId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
			sourceName: '시루',
			targetChannelId: CHANNEL_ID,
			webhookName: null,
			webhookAvatarUrl: null
		});
		expect(withNulls.success).toBe(true);
	});

	it('rejects a webhook avatar url that is not http(s)', () => {
		expect(
			socialSubscriptionCreateSchema.safeParse({
				guildId: GUILD_ID,
				platform: 'chzzk',
				sourcePlatformId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
				sourceName: '시루',
				targetChannelId: CHANNEL_ID,
				webhookAvatarUrl: 'file:///tmp/avatar.png'
			}).success
		).toBe(false);
	});

	it('rejects an invalid platform', () => {
		expect(
			socialSubscriptionCreateSchema.safeParse({
				guildId: GUILD_ID,
				platform: 'navertv',
				sourcePlatformId: 'x',
				sourceName: 'x',
				targetChannelId: CHANNEL_ID
			}).success
		).toBe(false);
	});

	it('rejects a template failing the issue check', () => {
		expect(
			socialSubscriptionCreateSchema.safeParse({
				guildId: GUILD_ID,
				platform: 'twitch',
				sourcePlatformId: '123456789',
				sourceName: '시루',
				targetChannelId: CHANNEL_ID,
				messageTemplate: '{title} <@&잘못된>'
			}).success
		).toBe(false);
	});

	it('defaults showThumbnail to true and honors an explicit false', () => {
		const base = {
			guildId: GUILD_ID,
			platform: 'chzzk' as const,
			sourcePlatformId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
			sourceName: '시루',
			targetChannelId: CHANNEL_ID
		};
		const defaults = socialSubscriptionCreateSchema.safeParse(base);
		expect(defaults.success).toBe(true);
		if (defaults.success) expect(defaults.data.showThumbnail).toBe(true);
		const withOff = socialSubscriptionCreateSchema.safeParse({ ...base, showThumbnail: false });
		expect(withOff.success).toBe(true);
		if (withOff.success) expect(withOff.data.showThumbnail).toBe(false);
	});

	it('rejects a non-boolean showThumbnail', () => {
		expect(
			socialSubscriptionCreateSchema.safeParse({
				guildId: GUILD_ID,
				platform: 'chzzk',
				sourcePlatformId: 'x',
				sourceName: 'x',
				targetChannelId: CHANNEL_ID,
				showThumbnail: 'yes'
			}).success
		).toBe(false);
	});
});

describe('socialSubscriptionUpdateSchema', () => {
	it('accepts a template-only update', () => {
		expect(socialSubscriptionUpdateSchema.safeParse({ messageTemplate: '{title}' }).success).toBe(true);
	});

	it('accepts a status-only update', () => {
		expect(socialSubscriptionUpdateSchema.safeParse({ status: 'disabled' }).success).toBe(true);
	});

	it('accepts clearing the template with null', () => {
		expect(socialSubscriptionUpdateSchema.safeParse({ messageTemplate: null }).success).toBe(true);
	});

	it('rejects an empty update body', () => {
		expect(socialSubscriptionUpdateSchema.safeParse({}).success).toBe(false);
	});

	it('accepts a webhook display-only update and clears it with null', () => {
		expect(
			socialSubscriptionUpdateSchema.safeParse({ webhookName: '시루 알림봇', webhookAvatarUrl: 'https://example.com/avatar.png' }).success
		).toBe(true);
		expect(socialSubscriptionUpdateSchema.safeParse({ webhookName: null, webhookAvatarUrl: null }).success).toBe(true);
	});

	it('rejects a webhook display update failing Discord rules', () => {
		expect(socialSubscriptionUpdateSchema.safeParse({ webhookName: 'discord 알림' }).success).toBe(false);
		expect(socialSubscriptionUpdateSchema.safeParse({ webhookAvatarUrl: 'ftp://example.com/avatar.png' }).success).toBe(false);
	});

	it('accepts a showThumbnail-only update', () => {
		expect(socialSubscriptionUpdateSchema.safeParse({ showThumbnail: false }).success).toBe(true);
		expect(socialSubscriptionUpdateSchema.safeParse({ showThumbnail: true }).success).toBe(true);
		expect(socialSubscriptionUpdateSchema.safeParse({ showThumbnail: 'yes' }).success).toBe(false);
	});
});

describe('socialWebhookNameSchema', () => {
	it('accepts and trims a valid display name', () => {
		const result = socialWebhookNameSchema.safeParse('  시루 알림봇  ');
		expect(result.success).toBe(true);
		if (result.success) expect(result.data).toBe('시루 알림봇');
	});

	it('rejects a name longer than 80 characters', () => {
		expect(socialWebhookNameSchema.safeParse('시루'.repeat(41)).success).toBe(false);
	});

	it('rejects discord and clyde substrings regardless of case', () => {
		expect(socialWebhookNameSchema.safeParse('Discord 알림').success).toBe(false);
		expect(socialWebhookNameSchema.safeParse('CLYDE봇').success).toBe(false);
	});

	it('rejects a blank name', () => {
		expect(socialWebhookNameSchema.safeParse('   ').success).toBe(false);
	});
});

describe('socialWebhookAvatarUrlSchema', () => {
	it('accepts an http(s) image url', () => {
		expect(socialWebhookAvatarUrlSchema.safeParse('https://cdn.example.com/avatar.png').success).toBe(true);
		expect(socialWebhookAvatarUrlSchema.safeParse('http://cdn.example.com/avatar.png').success).toBe(true);
	});

	it('rejects a non-http url', () => {
		expect(socialWebhookAvatarUrlSchema.safeParse('ftp://example.com/avatar.png').success).toBe(false);
	});

	it('rejects a malformed url', () => {
		expect(socialWebhookAvatarUrlSchema.safeParse('이미지 주소').success).toBe(false);
	});
});

describe('socialWebhookCreate contract', () => {
	it('accepts a well-formed request', () => {
		const result = socialWebhookCreateRequestSchema.safeParse({
			requestId: REQUEST_ID,
			guildId: GUILD_ID,
			targetChannelId: CHANNEL_ID,
			name: '시루 소셜 알림'
		});
		expect(result.success).toBe(true);
	});

	it('rejects a blank webhook name', () => {
		expect(
			socialWebhookCreateRequestSchema.safeParse({ requestId: REQUEST_ID, guildId: GUILD_ID, targetChannelId: CHANNEL_ID, name: '   ' }).success
		).toBe(false);
	});

	it('roundtrips a success response with the webhook credentials', () => {
		const result = socialWebhookCreateResponseSchema.safeParse({
			requestId: REQUEST_ID,
			guildId: GUILD_ID,
			webhookId: '0192837465f1e2d3c4',
			webhookToken: 'aBcD3fGhIjKlMnOpQrStUvWxYz0123456789-_AbCdEfGhIjKlMnOpQrStUvWxYz'
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.error).toBeUndefined();
	});

	it('accepts an error-only response carrying a korean message', () => {
		const result = socialWebhookCreateResponseSchema.safeParse({
			requestId: REQUEST_ID,
			guildId: GUILD_ID,
			error: '봇에 채널 관리 권한이 없어요.'
		});
		expect(result.success).toBe(true);
	});

	it('tolerates unknown fields in the response', () => {
		const result = socialWebhookCreateResponseSchema.safeParse({
			requestId: REQUEST_ID,
			guildId: GUILD_ID,
			webhookId: '0192837465f1e2d3c4',
			webhookToken: 'aBcD3fGhIjKlMnOpQrStUvWxYz0123456789-_AbCdEfGh',
			extra: '나중에 추가된 필드'
		});
		expect(result.success).toBe(true);
	});

	it('rejects a webhook token with invalid characters', () => {
		expect(
			socialWebhookCreateResponseSchema.safeParse({
				requestId: REQUEST_ID,
				guildId: GUILD_ID,
				webhookId: '0192837465f1e2d3c4',
				webhookToken: '공백 있는 토큰!'
			}).success
		).toBe(false);
	});

	it('rejects a non-uuid requestId', () => {
		expect(socialWebhookCreateResponseSchema.safeParse({ requestId: 'not-a-uuid', guildId: GUILD_ID }).success).toBe(false);
	});
});
