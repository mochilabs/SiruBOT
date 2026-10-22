import { z } from 'zod';
import { redisIdSchema } from './redisChannels.js';

/**
 * 소셜 알림 도메인의 공유 계약 — notifier(감지·전송), bot(웹훅 생성), dashboard(구독 관리·템플릿 편집)이 함께 써요.
 * Prisma SocialSubscription/SocialEventLog 모델과 1:1 대응이에요.
 */

/** 알림 플랫폼 — Prisma SocialSubscription.platform 값과 같아요 */
export const socialPlatformSchema = z.union([z.literal('youtube'), z.literal('chzzk'), z.literal('twitch')]);
export type SocialPlatform = z.infer<typeof socialPlatformSchema>;

/** 대시보드·안내 문구에 쓰는 플랫폼 표시 이름 */
export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
	youtube: '유튜브',
	chzzk: '치지직',
	twitch: '트위치'
};

/**
 * 정규화 이벤트 — 감지 어댑터(YT WebSub / TW EventSub / 치지직 폴링)가 플랫폼 페이로드를
 * 이 모양으로 바꾸고 디스패처가 소비해요. SocialEventLog.payload 스냅샷과도 같은 모양이에요.
 * (platform, contentId)가 dedup 키, sourceId가 구독 팬아웃 매칭 키예요.
 */
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

/**
 * content 커스텀 템플릿 계약 — 임베드는 커스텀하지 않아요 (플랫폼 기본 + 고정 accent color, 2차 후보).
 * 변수 {title} {url} {author}는 감지 시점 이벤트로 치환하고, 멘션은 <#채널ID> <@&역할ID> 토큰만
 * raw로 저장해요 (렌더링은 Discord가 함). 임베드 안의 멘션은 핑이 안 되는 Discord 스펙 때문에
 * 멘션은 무조건 content에만 둬요.
 */

/** 템플릿 변수 목록 — 이것 외의 {변수}는 저장 단계에서 거부해요 */
export const SOCIAL_TEMPLATE_VARIABLES = ['title', 'url', 'author'] as const;

/** 템플릿 최대 길이 — 렌더 결과는 Discord content 한도(2000자) 안으로 잘려요 */
export const SOCIAL_TEMPLATE_MAX_LENGTH = 1000;
/** Discord 웹훅 content 상한 — 렌더 결과가 길면 이 길이로 잘라요 */
export const DISCORD_CONTENT_MAX_LENGTH = 2000;

const CHANNEL_MENTION_PATTERN = /<#(\d{17,20})>/;
const ROLE_MENTION_PATTERN = /<@&(\d{17,20})>/;
const ROLE_MENTION_GLOBAL_PATTERN = /<@&(\d{17,20})>/g;
/** 완성된 중괄호 토큰({title} 등) 전체 — 시작 중괄호만 있는 경우(리터럴)는 여기 안 걸려요 */
const CURLY_TOKEN_PATTERN = /\{([^{}]*)\}/g;
/** 멘션처럼 보이는 여는 토큰 — 형식이 틀리면 안내하고, 멘션이 아니면 그냥 지나쳐요 */
const MENTION_LIKE_PATTERN = /<[#@:][^<>]*>?/g;

/**
 * 템플릿 문제 점검 — null이면 통과, 문제가 있으면 한국어 안내를 돌려줘요.
 * - {변수}는 허용 목록에 없으면 거부 (오타 변수 방지)
 * - 멘션은 <#채널ID> <@&역할ID>만 허용 — @everyone/@here·사용자 멘션·커스텀 이모지는 거부해요.
 *   웹훅 전송 시 allowed_mentions이 어차피 대부분 막지만, 저장 단계에서 거절해 실수를 줄여요.
 */
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

/**
 * 템플릿을 content 문자열로 렌더링해요 — {title} {url} {author}를 이벤트 값으로 치환하고
 * 멘션 토큰은 그대로 둬요 (Discord가 렌더링해요). 결과는 Discord content 한도를 넘지 않게 잘라요.
 */
export function renderSocialContent(template: string, event: SocialEvent): string {
	const rendered = template.replaceAll('{title}', event.title).replaceAll('{url}', event.url).replaceAll('{author}', event.author);
	return rendered.length > DISCORD_CONTENT_MAX_LENGTH ? `${rendered.slice(0, DISCORD_CONTENT_MAX_LENGTH - 1)}…` : rendered;
}

/**
 * 템플릿에 들어간 역할 멘션 ID만 추출해요 — 웹훅 전송 시 allowed_mentions.roles 화이트리스트로 써요.
 * 템플릿에 없는 역할은 실수로도 핑되지 않고, 채널 멘션은 화이트리스트 없이도 링크로 렌더링돼요.
 */
export function extractSocialTemplateRoleIds(template: string): string[] {
	return [...new Set([...template.matchAll(ROLE_MENTION_GLOBAL_PATTERN)].map((match) => match[1]))];
}

/**
 * 구독 메시지 템플릿 — SocialSubscription.messageTemplate. null이면 임베드만 전송해요.
 * 대시보드 저장 시 이 스키마로 검증하고, 편집기 미리보기는 renderSocialContent로 그려요.
 */
export const socialMessageTemplateSchema = z
	.string()
	.trim()
	.min(1, '템플릿이 비었어요. 알림 문구를 쓰지 않을 거면 그냥 비워 두세요.')
	.max(SOCIAL_TEMPLATE_MAX_LENGTH)
	.superRefine((template, ctx) => {
		const issue = socialTemplateIssue(template);
		if (issue) ctx.addIssue({ code: 'custom', message: issue });
	});

/** 구독 배달 상태 — 연속 5회 실패 또는 웹훅 404/410이면 failed, 관리자가 끄면 disabled */
export const socialSubscriptionStatusSchema = z.union([z.literal('active'), z.literal('failed'), z.literal('disabled')]);
export type SocialSubscriptionStatus = z.infer<typeof socialSubscriptionStatusSchema>;

/**
 * 웹훅 표시명 오버라이드 — 전송 payload의 username으로 쓰고, 구독 생성 시엔 봇이 만드는 웹훅 이름으로도 지정해요.
 * Discord 규칙: 1~80자, 'discord'·'clyde' 부분문자열 금지 (위반하면 Discord가 400으로 거부해요).
 */
export const socialWebhookNameSchema = z
	.string()
	.trim()
	.min(1, '웹훅 표시명은 1자 이상이어야 해요. 기본 이름으로 쓸 거면 비워 두세요.')
	.max(80, '웹훅 표시명은 80자 이하여야 해요.')
	.refine((name) => !/discord|clyde/i.test(name), { message: '웹훅 표시명에는 discord·clyde를 쓸 수 없어요 (Discord 규칙).' });

/** 웹훅 프로필 사진 오버라이드 — Discord가 전송 시점에 fetch하는 이미지 URL이에요 (http/https). */
export const socialWebhookAvatarUrlSchema = z
	.string()
	.trim()
	.url('프로필 사진 URL 형식이 올바르지 않아요.')
	.max(2048, '프로필 사진 URL은 2048자 이하여야 해요.')
	.refine((url) => /^https?:\/\//i.test(url), { message: '프로필 사진 URL은 http 또는 https 주소여야 해요.' });

/**
 * 구독 생성 요청 본문 — 대시보드가 data-api 프록시로 보내고 notifier가 검증·저장해요.
 * 웹훅은 이 요청 처리 중에 socialWebhookCreateRequestSchema 요청으로 봇에 만들어 달라고 해요.
 */
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
	webhookAvatarUrl: socialWebhookAvatarUrlSchema.nullable().optional()
});

/** 구독 수정 본문 — 템플릿·웹훅 표시·상태만 바꿔요 (채널·웹훅 재생성은 삭제 후 다시 만들어요) */
export const socialSubscriptionUpdateSchema = z
	.object({
		messageTemplate: socialMessageTemplateSchema.nullable().optional(),
		status: socialSubscriptionStatusSchema.optional(),
		/** 웹훅 표시명 오버라이드 — undefined면 변경 없음, null이면 기본 표시로 되돌려요 */
		webhookName: socialWebhookNameSchema.nullable().optional(),
		/** 웹훅 프로필 사진 오버라이드 — undefined면 변경 없음, null이면 기본 아바타로 되돌려요 */
		webhookAvatarUrl: socialWebhookAvatarUrlSchema.nullable().optional()
	})
	.refine(
		(body) =>
			body.messageTemplate !== undefined || body.status !== undefined || body.webhookName !== undefined || body.webhookAvatarUrl !== undefined,
		{ message: '수정할 항목이 없어요.' }
	);

/**
 * 웹훅 생성 요청 — notifier가 구독 생성 시점에 REQUEST 채널(sirubot:social:webhook-create:request)로
 * 퍼블리시하면, 해당 길드를 보유한 봇 프로세스가 createWebhook() 후 RESPONSE 채널로 응답해요.
 * 웹훅 생성은 Manage Webhooks 권한이 필요한데 봇만 갖고 있어요 (유저 OAuth 토큰으로는 불가).
 */
export const socialWebhookCreateRequestSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	/** 웹훅을 만들 디스코드 채널 */
	targetChannelId: redisIdSchema,
	/** 웹훅 이름 — Discord 채널 통합 화면에 표시돼요 */
	name: z.string().trim().min(1).max(80)
});
export type SocialWebhookCreateRequest = z.infer<typeof socialWebhookCreateRequestSchema>;

/**
 * 웹훅 생성 응답 — 성공이면 webhookId·webhookToken을 채우고, 실패(권한 없음·채널 없음·봇 미보유)면
 * error에 한국어 안내를 실어요. 스키마는 loose하게 두어(미사용 필드 허용) 필드 추가가 이전 읽기를 깨지 않게 해요.
 */
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
