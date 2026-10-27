import * as Sentry from '@sentry/nextjs';
import { scrubSecrets } from '@sirubot/utils/sentry';

interface RouteErrorContext {
	/** 라우트 레이트리밋 버킷 키 = `api-handler` 옵션의 key (라우트 식별자) */
	key: string;
	role: string;
	guildId: string | null;
	userId: string;
}

/**
 * 대시보드 Sentry (서버 런타임).
 *
 * 지금까지 이 앱은 `console.error`만 써서 프로덕션 오류가 어디에도 남지 않았어요.
 * API 라우트는 `createGuildApiHandler`가 `reportRouteError`로 한 번만 보고하고,
 * 페이지/RSC에서 던진 예외는 Next 계측 훅(`instrumentation.ts`)이 이 초기화를 쓴 뒤 자동으로 잡아요.
 * SENTRY_DSN이 없으면 아무 것도 하지 않아 로컬 개발에는 영향이 없어요.
 *
 * 비밀 마스킹은 다른 앱과 같은 공용 규칙(`@sirubot/utils/sentry`의 `scrubSecrets`)을 재사용해요 —
 * 웹훅 URL·쿼리 토큰·Bearer 헤더가 이벤트에 실려 나가지 않게요.
 */
export function initDashboardSentry(): void {
	const dsn = process.env.SENTRY_DSN;
	if (!dsn) return;

	const environment = process.env.NODE_ENV ?? 'development';
	const isProd = environment === 'production';

	Sentry.init({
		dsn,
		environment,
		release: process.env.SENTRY_RELEASE ?? process.env.VERSION ?? 'unknown',
		tracesSampleRate: isProd ? 0.1 : 0,
		maxBreadcrumbs: 50,
		// 기본 PII(쿠키·IP·요청 본문)는 보내지 않아요 — 사용자 식별은 태그로만 남겨요.
		sendDefaultPii: false,
		beforeSend: (event) => scrubSecrets(event)
	});
}


/**
 * API 라우트 예외 보고 — `api-handler` 래퍼만 호출해요.
 * 사용자 응답은 래퍼가 500 JSON으로 고정하고, 여기서는 추적용 태그만 붙여요.
 */
export function reportRouteError(error: unknown, context: RouteErrorContext): void {
	// DSN이 없으면 Sentry는 no-op이지만, 로그는 남겨 로컬에서도 원인을 볼 수 있게 해요
	console.error(`[api] ${context.key} failed:`, error);
	if (!process.env.SENTRY_DSN) return;

	Sentry.withScope((scope) => {
		scope.setTag('api_route', context.key);
		scope.setTag('api_role', context.role);
		if (context.guildId) scope.setTag('guild_id', context.guildId);
		scope.setUser({ id: context.userId });
		Sentry.captureException(error);
	});
}
