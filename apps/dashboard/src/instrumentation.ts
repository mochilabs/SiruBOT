export async function register(): Promise<void> {
	if (process.env.NEXT_RUNTIME === 'nodejs') {
		const { initDashboardSentry } = await import('./lib/sentry');
		initDashboardSentry();
	}
}
