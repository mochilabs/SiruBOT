import { z } from 'zod';

const envSchema = z
	.object({
		PORT: z.coerce.number().default(3004),
		// 웹훅 생성 request/reply 허브가 쓰는 Redis — 봇과 공유해요. 없으면 허브가 경고만 남기고 꺼져요.
		REDIS_URL: z.string().optional(),
		// Prisma 연결 — 구독·이벤트 로그 저장에 써요. 첫 사용 시 lazy 연결해요.
		DATABASE_URL: z.string().optional(),
		// 자체 키를 우선 쓰고, 없으면 봇과 공유하는 AUTH_KEY로 폴백해요 (data-api·storage와 같은 계약)
		NOTIFIER_AUTH_KEY: z.string().optional(),
		AUTH_KEY: z.string().optional(),
		// 유튜브 WebSub 콜백이 도달할 공개 주소 (예: https://notifier.example.com — 경로 없이).
		// YOUTUBE_HUB_SECRET와 세트로 있어야 WebSub 푸시가 켜져요. 없으면 RSS 감사만 동작해요.
		NOTIFIER_PUBLIC_URL: z.string().optional(),
		// WebSub hub.secret — 콜백 X-Hub-Signature HMAC 검증에 써요.
		YOUTUBE_HUB_SECRET: z.string().optional(),
		// 트위치 EventSub 앱 자격 — Client ID/Secret 세트 + 공개 URL + 검증 시크릿이 있어야 푸시가 켜져요.
		TWITCH_CLIENT_ID: z.string().optional(),
		TWITCH_CLIENT_SECRET: z.string().optional(),
		// EventSub 구독 secret — 콜백 HMAC 검증 + 구독 생성에 같이 써요 (트위치 규칙: 20~100자).
		TWITCH_EVENTSUB_SECRET: z.string().optional(),
		// 치지직 폴러 킬 스위치 — 'false'일 때만 꺼요. (z.coerce.boolean()은 'false'를 true로 바꿔버리니 문자열 비교로 해요.)
		CHZZK_POLLING_ENABLED: z.string().optional()
	})
	.transform((env) => ({
		...env,
		notifierAuthKey: env.NOTIFIER_AUTH_KEY ?? env.AUTH_KEY,
		// 끝 슬래시 정규화 — 콜백 URL 조립(/pubsub/youtube)이 깔끔해요.
		notifierPublicUrl: env.NOTIFIER_PUBLIC_URL?.replace(/\/+$/, ''),
		chzzkPollingEnabled: env.CHZZK_POLLING_ENABLED !== 'false'
	}));

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
	const result = envSchema.safeParse(process.env);
	if (!result.success) {
		console.error('❌ Invalid environment variables:');
		console.error(result.error.format());
		process.exit(1);
	}
	// 키가 없으면 fail-closed — 인증 없는 notifier로 기동하지 않아요. 무인증 표면은 공개 콜백(+health)뿐이에요.
	if (!result.data.notifierAuthKey) {
		console.error('❌ NOTIFIER_AUTH_KEY 또는 AUTH_KEY 중 하나는 반드시 설정해야 해요.');
		process.exit(1);
	}
	return result.data;
}
