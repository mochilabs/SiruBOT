import { z } from 'zod';
import { redisIdSchema } from './redisChannels.js';

// Mirrors the Prisma SocialSubscription / SocialEventLog models.

export const socialPlatformSchema = z.union([z.literal('youtube'), z.literal('chzzk'), z.literal('twitch')]);
export type SocialPlatform = z.infer<typeof socialPlatformSchema>;

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
	youtube: '유튜브',
	chzzk: '치지직',
	twitch: '트위치'
};

/** (platform, contentId) is the dedup key; sourceId matches subscriptions for fan-out. */
export const socialEventSchema = z.object({
	platform: socialPlatformSchema,
	/** 이벤트를 일으킨 채널의 플랫폼 식별자 — SocialSubscription.sourcePlatformId와 매칭돼요 */
	sourceId: z.string().min(1).max(128),
	/** 콘텐츠 식별자 — YT 영상ID / 치지직 liveID / Twitch 방송ID */
	contentId: z.string().min(1).max(128),
	title: z.string().min(1).max(512),
	url: z.string().url().max(2048),
	thumbnail: z.string().url().max(2048).nullable(),
	author: z.string().min(1).max(128),
	/** 발생 시각 (epoch ms) — 임베드 타임스탬프로 써요 */
	publishedAt: z.number().int().positive()
});
export type SocialEvent = z.infer<typeof socialEventSchema>;

// Only `content` is customizable, never the embed. Mentions stay raw `<#channelId>` / `<@&roleId>` tokens (Discord renders them)
// and live in `content` only, because mentions inside embeds don't ping.

/** Any other {variable} is rejected on save. */
export const SOCIAL_TEMPLATE_VARIABLES = ['title', 'url', 'author'] as const;

export const SOCIAL_TEMPLATE_MAX_LENGTH = 1000;
export const DISCORD_CONTENT_MAX_LENGTH = 2000;

const CHANNEL_MENTION_PATTERN = /<#(\d{17,20})>/;
const ROLE_MENTION_PATTERN = /<@&(\d{17,20})>/;
const ROLE_MENTION_GLOBAL_PATTERN = /<@&(\d{17,20})>/g;
/** Complete tokens only; a lone `{` is a literal. */
const CURLY_TOKEN_PATTERN = /\{([^{}]*)\}/g;
const MENTION_LIKE_PATTERN = /<[#@:][^<>]*>?/g;

/** Null passes. Only `<#channelId>` / `<@&roleId>` mentions are allowed; allowed_mentions would mostly block the rest at send time, but rejecting on save catches mistakes early. */
export function socialTemplateIssue(template: string): string | null {
	if (template.length > SOCIAL_TEMPLATE_MAX_LENGTH) return `템플릿은 ${SOCIAL_TEMPLATE_MAX_LENGTH}자 이하여야 해요.`;
	const variables = SOCIAL_TEMPLATE_VARIABLES.map((variable) => `{${variable}}`).join(' ');
	for (const match of template.matchAll(CURLY_TOKEN_PATTERN)) {
		if (!(SOCIAL_TEMPLATE_VARIABLES as readonly string[]).includes(match[1])) {
			return `알 수 없는 변수 {${match[1]}}예요. 사용 가능한 변수: ${variables}`;
		}
	}
	if (/@(everyone|here)\b/i.test(template)) return '@everyone·@here는 템플릿에 쓸 수 없어요. 역할 알림은 <@&역할ID>로 넣어요.';
	if (/<@\d{17,20}>/.test(template)) return '사용자 멘션은 지원하지 않아요. 채널 <#채널ID> 또는 역할 <@&역할ID>만 써요.';
	for (const match of template.matchAll(MENTION_LIKE_PATTERN)) {
		const token = match[0];
		if (token.startsWith('<#')) {
			if (!CHANNEL_MENTION_PATTERN.test(token)) return '채널 멘션 형식이 올바르지 않아요. <#채널ID> 형태로 넣어요.';
		} else if (token.startsWith('<@&')) {
			if (!ROLE_MENTION_PATTERN.test(token)) return '역할 멘션 형식이 올바르지 않아요. <@&역할ID> 형태로 넣어요.';
		} else if (token.startsWith('<@')) {
			return '사용자 멘션은 지원하지 않아요. 채널 <#채널ID> 또는 역할 <@&역할ID>만 써요.';
		} else if (token.startsWith('<:')) {
			return '커스텀 이모지는 아직 지원하지 않아요. 유니코드 이모지는 그대로 쓸 수 있어요.';
		}
	}
	return null;
}

export function renderSocialContent(template: string, event: SocialEvent): string {
	const rendered = template.replaceAll('{title}', event.title).replaceAll('{url}', event.url).replaceAll('{author}', event.author);
	return rendered.length > DISCORD_CONTENT_MAX_LENGTH ? `${rendered.slice(0, DISCORD_CONTENT_MAX_LENGTH - 1)}…` : rendered;
}

/** Feeds the `allowed_mentions.roles` allowlist so only roles named in the template can ping; channel mentions render as links without one. */
export function extractSocialTemplateRoleIds(template: string): string[] {
	return [...new Set([...template.matchAll(ROLE_MENTION_GLOBAL_PATTERN)].map((match) => match[1]))];
}

/** Null sends the embed only. */
export const socialMessageTemplateSchema = z
	.string()
	.trim()
	.min(1, '템플릿이 비었어요. 알림 문구를 쓰지 않을 거면 그냥 비워 두세요.')
	.max(SOCIAL_TEMPLATE_MAX_LENGTH)
	.superRefine((template, ctx) => {
		const issue = socialTemplateIssue(template);
		if (issue) ctx.addIssue({ code: 'custom', message: issue });
	});

/** failed after 5 consecutive failures or a webhook 404/410; disabled when an admin turns it off. */
export const socialSubscriptionStatusSchema = z.union([z.literal('active'), z.literal('failed'), z.literal('disabled')]);
export type SocialSubscriptionStatus = z.infer<typeof socialSubscriptionStatusSchema>;

/** Discord rejects with 400 names outside 1~80 characters or containing 'discord' or 'clyde'. */
export const socialWebhookNameSchema = z
	.string()
	.trim()
	.min(1, '웹훅 표시명은 1자 이상이어야 해요. 기본 이름으로 쓸 거면 비워 두세요.')
	.max(80, '웹훅 표시명은 80자 이하여야 해요.')
	.refine((name) => !/discord|clyde/i.test(name), { message: '웹훅 표시명에는 discord·clyde를 쓸 수 없어요 (Discord 규칙).' });

/** Discord fetches this image URL at send time. */
export const socialWebhookAvatarUrlSchema = z
	.string()
	.trim()
	.url('프로필 사진 URL 형식이 올바르지 않아요.')
	.max(2048, '프로필 사진 URL은 2048자 이하여야 해요.')
	.refine((url) => /^https?:\/\//i.test(url), { message: '프로필 사진 URL은 http 또는 https 주소여야 해요.' });

export const socialSubscriptionCreateSchema = z.object({
	guildId: redisIdSchema,
	platform: socialPlatformSchema,
	/** 플랫폼별 채널 식별자 — YT 채널ID(UC...) / 치지직 채널ID(32-hex) / Twitch 사용자ID */
	sourcePlatformId: z.string().min(1).max(128),
	/** 표시용 채널 이름 — 대시보드 검색·붙여넣기 단계에서 미리 구해와요 */
	sourceName: z.string().min(1).max(128),
	targetChannelId: redisIdSchema,
	/** null이면 플랫폼 기본(임베드만), 있으면 content 커스텀 */
	messageTemplate: socialMessageTemplateSchema.nullable().optional(),
	/** 웹훅 표시명 오버라이드 — null이면 기본 이름(시루 소셜 알림 — 채널 이름)으로 만들어요 */
	webhookName: socialWebhookNameSchema.nullable().optional(),
	/** 웹훅 프로필 사진 오버라이드 — null이면 웹훅 기본 아바타로 전송해요 */
	webhookAvatarUrl: socialWebhookAvatarUrlSchema.nullable().optional(),
	/** 라이브 섬네일 표시 — 임베드에 라이브 이미지를 넣을지 (기본 ON, Prisma showThumbnail 기본값과 동일) */
	showThumbnail: z.boolean().optional().default(true)
});

/** Channel and webhook can't change; delete and recreate instead. */
export const socialSubscriptionUpdateSchema = z
	.object({
		messageTemplate: socialMessageTemplateSchema.nullable().optional(),
		status: socialSubscriptionStatusSchema.optional(),
		/** 웹훅 표시명 오버라이드 — undefined면 변경 없음, null이면 기본 표시로 되돌려요 */
		webhookName: socialWebhookNameSchema.nullable().optional(),
		/** 웹훅 프로필 사진 오버라이드 — undefined면 변경 없음, null이면 기본 아바타로 되돌려요 */
		webhookAvatarUrl: socialWebhookAvatarUrlSchema.nullable().optional(),
		/** 라이브 섬네일 표시 — undefined면 변경 없음 */
		showThumbnail: z.boolean().optional()
	})
	.refine(
		(body) =>
			body.messageTemplate !== undefined ||
			body.status !== undefined ||
			body.webhookName !== undefined ||
			body.webhookAvatarUrl !== undefined ||
			body.showThumbnail !== undefined,
		{ message: '수정할 항목이 없어요.' }
	);

export const socialWebhookCreateRequestSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	/** 웹훅을 만들 디스코드 채널 */
	targetChannelId: redisIdSchema,
	/** 웹훅 이름 — Discord 채널 통합 화면에 표시돼요 */
	name: z.string().trim().min(1).max(80)
});
export type SocialWebhookCreateRequest = z.infer<typeof socialWebhookCreateRequestSchema>;

/** Loose on purpose so added fields don't break older readers. Failures (no permission, no channel, guild not owned) set a Korean `error`. */
export const socialWebhookCreateResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	error: z.string().optional(),
	/** 성공 시 — 봇이 만든 웹훅 ID */
	webhookId: redisIdSchema.optional(),
	/** 성공 시 — 웹훅 token (민감: DB에 저장하고 대시보드 응답에서는 마스킹해요) */
	webhookToken: z
		.string()
		.min(20)
		.max(128)
		.regex(/^[\w-]+$/, '웹훅 token 형식이 올바르지 않아요.')
		.optional()
});
export type SocialWebhookCreateResponse = z.infer<typeof socialWebhookCreateResponseSchema>;
