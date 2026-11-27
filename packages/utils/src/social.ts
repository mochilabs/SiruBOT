import { z } from 'zod';
import { redisIdSchema } from './redisChannels.js';

export const socialPlatformSchema = z.union([z.literal('youtube'), z.literal('chzzk'), z.literal('twitch')]);
export type SocialPlatform = z.infer<typeof socialPlatformSchema>;

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
	youtube: '유튜브',
	chzzk: '치지직',
	twitch: '트위치'
};

export const socialEventSchema = z.object({
	platform: socialPlatformSchema,
	sourceId: z.string().min(1).max(128),
	contentId: z.string().min(1).max(128),
	title: z.string().min(1).max(512),
	url: z.string().url().max(2048),
	thumbnail: z.string().url().max(2048).nullable(),
	author: z.string().min(1).max(128),
	publishedAt: z.number().int().positive()
});
export type SocialEvent = z.infer<typeof socialEventSchema>;

export const SOCIAL_TEMPLATE_VARIABLES = ['title', 'url', 'author'] as const;

export const SOCIAL_TEMPLATE_MAX_LENGTH = 1000;
export const DISCORD_CONTENT_MAX_LENGTH = 2000;

const CHANNEL_MENTION_PATTERN = /<#(\d{17,20})>/;
const ROLE_MENTION_PATTERN = /<@&(\d{17,20})>/;
const ROLE_MENTION_GLOBAL_PATTERN = /<@&(\d{17,20})>/g;
const CURLY_TOKEN_PATTERN = /\{([^{}]*)\}/g;
const MENTION_LIKE_PATTERN = /<[#@:][^<>]*>?/g;

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

export function extractSocialTemplateRoleIds(template: string): string[] {
	return [...new Set([...template.matchAll(ROLE_MENTION_GLOBAL_PATTERN)].map((match) => match[1]))];
}

export const socialMessageTemplateSchema = z
	.string()
	.trim()
	.min(1, '템플릿이 비었어요. 알림 문구를 쓰지 않을 거면 그냥 비워 두세요.')
	.max(SOCIAL_TEMPLATE_MAX_LENGTH)
	.superRefine((template, ctx) => {
		const issue = socialTemplateIssue(template);
		if (issue) ctx.addIssue({ code: 'custom', message: issue });
	});

export const socialSubscriptionStatusSchema = z.union([z.literal('active'), z.literal('failed'), z.literal('disabled')]);
export type SocialSubscriptionStatus = z.infer<typeof socialSubscriptionStatusSchema>;

export const socialWebhookNameSchema = z
	.string()
	.trim()
	.min(1, '웹훅 표시명은 1자 이상이어야 해요. 기본 이름으로 쓸 거면 비워 두세요.')
	.max(80, '웹훅 표시명은 80자 이하여야 해요.')
	.refine((name) => !/discord|clyde/i.test(name), { message: '웹훅 표시명에는 discord·clyde를 쓸 수 없어요 (Discord 규칙).' });

export const socialWebhookAvatarUrlSchema = z
	.string()
	.trim()
	.url('프로필 사진 URL 형식이 올바르지 않아요.')
	.max(2048, '프로필 사진 URL은 2048자 이하여야 해요.')
	.refine((url) => /^https?:\/\//i.test(url), { message: '프로필 사진 URL은 http 또는 https 주소여야 해요.' });

export const socialSubscriptionCreateSchema = z.object({
	guildId: redisIdSchema,
	platform: socialPlatformSchema,
	sourcePlatformId: z.string().min(1).max(128),
	sourceName: z.string().min(1).max(128),
	targetChannelId: redisIdSchema,
	messageTemplate: socialMessageTemplateSchema.nullable().optional(),
	webhookName: socialWebhookNameSchema.nullable().optional(),
	webhookAvatarUrl: socialWebhookAvatarUrlSchema.nullable().optional(),
	showThumbnail: z.boolean().optional().default(true)
});

export const socialSubscriptionUpdateSchema = z
	.object({
		messageTemplate: socialMessageTemplateSchema.nullable().optional(),
		status: socialSubscriptionStatusSchema.optional(),
		webhookName: socialWebhookNameSchema.nullable().optional(),
		webhookAvatarUrl: socialWebhookAvatarUrlSchema.nullable().optional(),
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
	targetChannelId: redisIdSchema,
	name: z.string().trim().min(1).max(80)
});
export type SocialWebhookCreateRequest = z.infer<typeof socialWebhookCreateRequestSchema>;

export const socialWebhookCreateResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	error: z.string().optional(),
	webhookId: redisIdSchema.optional(),
	webhookToken: z
		.string()
		.min(20)
		.max(128)
		.regex(/^[\w-]+$/, '웹훅 token 형식이 올바르지 않아요.')
		.optional()
});
export type SocialWebhookCreateResponse = z.infer<typeof socialWebhookCreateResponseSchema>;
