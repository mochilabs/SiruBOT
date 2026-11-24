import { AsyncLocalStorage } from 'node:async_hooks';
import { ProxyAgent, type Dispatcher } from 'undici';
import { getLogger } from './logger.ts';

const logger = getLogger('proxy-pool');

const REQUEST_TIMEOUT_MS = 10_000;
const PROXY_CONNECT_TIMEOUT_MS = 3_000;
/** 상대가 막았다는 신호(429·403·봇 확인) 뒤 쉬는 시간 */
const BLOCKED_COOLDOWN_MS = 15 * 60_000;
/** 연결 실패·타임아웃 뒤 쉬는 시간 */
const NETWORK_COOLDOWN_MS = 60_000;
/** 작업 하나가 시도할 수 있는 경로 수 */
const MAX_ROUTES_PER_RUN = 2;
const BLOCKED_STATUSES = new Set([403, 429]);

type FetchFn = typeof globalThis.fetch;
type Outcome = 'ok' | 'blocked' | 'network' | 'error';

/** 나가는 경로 하나 — `direct`이거나 HTTP 프록시예요. */
export interface OutboundRoute {
	/** 'direct' 또는 프록시 주소(로그·메트릭용, 인증 정보 없이) */
	readonly id: string;
	readonly direct: boolean;
	/** 이 경로로 나가는 fetch. 응답 상태와 연결 오류를 지켜보다가 작업이 실패하면 쿨다운 사유로 써요. */
	readonly fetch: FetchFn;
	/** 응답은 200인데 내용이 차단(봇 확인 등)일 때 호출해서 던져요. */
	blocked(reason: string): RouteBlockedError;
}

export class RouteBlockedError extends Error {
	public constructor(reason: string) {
		super(`outbound route blocked: ${reason}`);
		this.name = 'RouteBlockedError';
	}
}

/** 시도할 수 있는 경로가 없거나 모두 막혔어요. */
export class ProxyUnavailableError extends Error {
	public constructor(scope: string, detail: string) {
		super(`no outbound route available for ${scope}: ${detail}`);
		this.name = 'ProxyUnavailableError';
	}
}

interface RunSignal {
	blocked: string | null;
	network: boolean;
}

/** 진행 중인 작업의 신호 — 경로별로 한 번 만든 클라이언트(Innertube 등)도 같은 fetch로 신호를 남길 수 있게 해요. */
const runSignal = new AsyncLocalStorage<RunSignal>();

interface RouteState {
	route: OutboundRoute;
	/** scope → 쉬는 게 끝나는 시각 */
	cooldownUntil: Map<string, number>;
	counts: Record<Outcome, number>;
}

export interface ProxyPoolOptions {
	now?: () => number;
	/** 테스트용: 경로별 fetch를 바꿔 끼워요 */
	createFetch?: (entry: string) => FetchFn;
}

/** 'direct'와 http(s) 프록시 주소를 쉼표로 적은 목록을 읽어요. 비어 있으면 direct 하나예요. */
export function parseRouteList(raw: string | undefined): string[] {
	const entries = (raw ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	for (const entry of entries) {
		if (entry === 'direct') continue;
		const url = new URL(entry);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`unsupported proxy protocol: ${url.protocol}`);
	}
	return entries.length > 0 ? [...new Set(entries)] : ['direct'];
}

function redact(entry: string): string {
	if (entry === 'direct') return entry;
	const url = new URL(entry);
	url.username = '';
	url.password = '';
	return url.origin;
}

function withTimeout(init: RequestInit | undefined): RequestInit {
	const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
	return { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout };
}

function defaultFetch(entry: string): FetchFn {
	if (entry === 'direct') return (input, init) => fetch(input, withTimeout(init));
	const dispatcher: Dispatcher = new ProxyAgent({ uri: entry, connect: { timeout: PROXY_CONNECT_TIMEOUT_MS } });
	// Node 내장 fetch는 npm undici의 dispatcher도 받아요. 타입은 내장 undici-types와 버전이 달라 unknown으로 넘겨요
	return (input, init) => fetch(input, { ...withTimeout(init), dispatcher } as unknown as RequestInit);
}

/**
 * 나가는 경로 묶음. `direct`는 적힌 순서대로 먼저 쓰고, 프록시끼리는 번갈아 써요.
 * 쿨다운은 (경로, scope) 단위라, 한 종류의 요청이 막혀도 다른 종류는 그 경로를 계속 써요.
 */
export class ProxyPool {
	private readonly states: RouteState[];
	private readonly now: () => number;
	private cursor = 0;

	public constructor(entries: string[], options: ProxyPoolOptions = {}) {
		this.now = options.now ?? Date.now;
		const createFetch = options.createFetch ?? defaultFetch;
		this.states = entries.map((entry) => {
			const base = createFetch(entry);
			const route: OutboundRoute = {
				id: redact(entry),
				direct: entry === 'direct',
				fetch: async (input, init) => {
					const signal = runSignal.getStore();
					let response: Response;
					try {
						response = await base(input, init);
					} catch (error) {
						if (signal && !init?.signal?.aborted) signal.network = true;
						throw error;
					}
					if (signal && BLOCKED_STATUSES.has(response.status)) signal.blocked ??= `http ${response.status}`;
					return response;
				},
				blocked: (reason) => {
					const signal = runSignal.getStore();
					if (signal) signal.blocked ??= reason;
					return new RouteBlockedError(reason);
				}
			};
			return { route, cooldownUntil: new Map(), counts: { ok: 0, blocked: 0, network: 0, error: 0 } };
		});
	}

	private available(state: RouteState, scope: string, tried: Set<RouteState>): boolean {
		return !tried.has(state) && (state.cooldownUntil.get(scope) ?? 0) <= this.now();
	}

	private pick(scope: string, tried: Set<RouteState>): RouteState | null {
		const direct = this.states.find((s) => s.route.direct && this.available(s, scope, tried));
		if (direct) return direct;
		const proxies = this.states.filter((s) => !s.route.direct);
		for (let i = 0; i < proxies.length; i++) {
			const state = proxies[(this.cursor + i) % proxies.length]!;
			if (this.available(state, scope, tried)) {
				this.cursor = (this.cursor + i + 1) % proxies.length;
				return state;
			}
		}
		return null;
	}

	private cooldown(state: RouteState, scope: string, ms: number, reason: string): void {
		const wasCooling = (state.cooldownUntil.get(scope) ?? 0) > this.now();
		state.cooldownUntil.set(scope, this.now() + ms);
		if (!wasCooling) logger.warn(`route ${state.route.id} cooling down for ${scope} (${Math.round(ms / 60_000)}m): ${reason}`);
	}

	/**
	 * 경로를 하나 골라 작업 전체를 그 경로로 해요. 막혔거나 연결이 안 되면 그 경로를 쉬게 하고 다음 경로로 한 번 더 해요.
	 * 그 밖의 오류(파싱 실패 등)는 다시 시도하지 않고 그대로 던져요.
	 */
	public async run<T>(scope: string, task: (route: OutboundRoute) => Promise<T>): Promise<T> {
		const tried = new Set<RouteState>();
		let lastReason = 'all routes cooling down';
		for (let attempt = 0; attempt < MAX_ROUTES_PER_RUN; attempt++) {
			const state = this.pick(scope, tried);
			if (!state) break;
			tried.add(state);
			const signal: RunSignal = { blocked: null, network: false };
			try {
				const result = await runSignal.run(signal, () => task(state.route));
				state.counts.ok++;
				return result;
			} catch (error) {
				if (signal.blocked) {
					state.counts.blocked++;
					this.cooldown(state, scope, BLOCKED_COOLDOWN_MS, signal.blocked);
					lastReason = `${state.route.id} ${signal.blocked}`;
					continue;
				}
				if (signal.network) {
					state.counts.network++;
					this.cooldown(state, scope, NETWORK_COOLDOWN_MS, String(error));
					lastReason = `${state.route.id} unreachable`;
					continue;
				}
				state.counts.error++;
				throw error;
			}
		}
		throw new ProxyUnavailableError(scope, lastReason);
	}

	public snapshot(): Array<{ route: string; cooling: Record<string, number>; counts: Record<Outcome, number> }> {
		const now = this.now();
		return this.states.map((s) => ({
			route: s.route.id,
			cooling: Object.fromEntries([...s.cooldownUntil].filter(([, until]) => until > now).map(([scope, until]) => [scope, until - now])),
			counts: { ...s.counts }
		}));
	}
}

let pool = new ProxyPool(['direct']);

/** 부팅 때 env(OUTBOUND_PROXY_URLS)로 한 번 설정해요. 설정 전에는 direct 하나예요. */
export function configureOutboundPool(raw: string | undefined): ProxyPool {
	const entries = parseRouteList(raw);
	pool = new ProxyPool(entries);
	logger.info(`outbound routes: ${entries.map(redact).join(', ')}`);
	return pool;
}

export function outboundPool(): ProxyPool {
	return pool;
}
