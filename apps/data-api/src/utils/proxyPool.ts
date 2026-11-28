import { AsyncLocalStorage } from 'node:async_hooks';
import { ProxyAgent, type Dispatcher } from 'undici';
import { getLogger } from './logger.ts';

const logger = getLogger('proxy-pool');

const REQUEST_TIMEOUT_MS = 10_000;
const PROXY_CONNECT_TIMEOUT_MS = 3_000;
const BLOCKED_COOLDOWN_MS = 15 * 60_000;
const NETWORK_COOLDOWN_MS = 60_000;
const MAX_ROUTES_PER_RUN = 2;
const BLOCKED_STATUSES = new Set([403, 429]);

type FetchFn = typeof globalThis.fetch;
type Outcome = 'ok' | 'blocked' | 'network' | 'error';

export interface OutboundRoute {
	readonly id: string;
	readonly direct: boolean;
	readonly fetch: FetchFn;
	blocked(reason: string): RouteBlockedError;
}

export class RouteBlockedError extends Error {
	public constructor(reason: string) {
		super(`outbound route blocked: ${reason}`);
		this.name = 'RouteBlockedError';
	}
}

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

const runSignal = new AsyncLocalStorage<RunSignal>();

interface RouteState {
	route: OutboundRoute;
	cooldownUntil: Map<string, number>;
	counts: Record<Outcome, number>;
}

export interface ProxyPoolOptions {
	now?: () => number;
	createFetch?: (entry: string) => FetchFn;
}

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
	// Cast dispatcher for Node fetch; npm undici types differ from built-in undici-types.
	return (input, init) => fetch(input, { ...withTimeout(init), dispatcher } as unknown as RequestInit);
}

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

export function configureOutboundPool(raw: string | undefined): ProxyPool {
	const entries = parseRouteList(raw);
	pool = new ProxyPool(entries);
	logger.info(`outbound routes: ${entries.map(redact).join(', ')}`);
	return pool;
}

export function outboundPool(): ProxyPool {
	return pool;
}
