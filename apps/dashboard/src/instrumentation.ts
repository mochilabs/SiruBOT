/**
 * Next 계측 훅 — 런타임별 Sentry 초기화 지점이에요.
 * 서버(Node.js) 런타임만 초기화해요: 대시보드 API/서버 컴포넌트가 여기서 돌아가고,
 * edge 런타임은 쓰지 않아요(미들웨어 없음).
 */
export async function register(): Promise<void> {
	if (process.env.NEXT_RUNTIME !== 'nodejs') return;
	const { initDashboardSentry } = await import('./lib/sentry');
	initDashboardSentry();
}
