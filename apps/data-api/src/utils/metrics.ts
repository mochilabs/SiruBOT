/** 라우트별 가벼운 계측. /v1/status에서 노출해요 (대시보드 P1 연동용). */
interface RouteStats {
	requests: number;
	cacheHits: number;
	upstreamCalls: number;
	upstreamErrors: number;
	lastMs: number | null;
	lastOkAt: number | null;
	lastErrorAt: number | null;
}

const routes = new Map<string, RouteStats>();

function get(name: string): RouteStats {
	let s = routes.get(name);
	if (!s) {
		s = {
			requests: 0,
			cacheHits: 0,
			upstreamCalls: 0,
			upstreamErrors: 0,
			lastMs: null,
			lastOkAt: null,
			lastErrorAt: null
		};
		routes.set(name, s);
	}
	return s;
}

export const metrics = {
	request(name: string): void {
		get(name).requests++;
	},
	hit(name: string): void {
		get(name).cacheHits++;
	},
	upstream(name: string, ms: number, ok: boolean): void {
		const s = get(name);
		s.upstreamCalls++;
		s.lastMs = ms;
		if (ok) s.lastOkAt = Date.now();
		else {
			s.upstreamErrors++;
			s.lastErrorAt = Date.now();
		}
	},
	snapshot(): Record<string, RouteStats> {
		return Object.fromEntries(routes.entries());
	}
};
