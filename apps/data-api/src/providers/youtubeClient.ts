import { Innertube } from 'youtubei.js';
import type { OutboundRoute } from '../utils/proxyPool.ts';

const YOUTUBE_TIMEOUT_MS = 10_000;
let clientPromise: Promise<Innertube> | null = null;
/** 경로마다 따로 만든 클라이언트 — 방문자 정보(세션)가 그 경로의 출구 IP와 맞아요. */
const routeClients = new WeakMap<OutboundRoute, Promise<Innertube>>();

/** 직접 나가는 기본 클라이언트 (검색 자동완성 등 경로를 고르지 않는 요청). */
export function youtubeClient(): Promise<Innertube> {
	if (!clientPromise) {
		clientPromise = Innertube.create({
			fetch: (input, init) => {
				const timeout = AbortSignal.timeout(YOUTUBE_TIMEOUT_MS);
				return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
			}
		}).catch((error: unknown) => {
			clientPromise = null;
			throw error;
		});
	}
	return clientPromise;
}

/** `outboundPool().run()`이 고른 경로로 나가는 클라이언트. 세션 생성도 그 경로로 해요. */
export function youtubeClientFor(route: OutboundRoute): Promise<Innertube> {
	let client = routeClients.get(route);
	if (!client) {
		client = Innertube.create({ fetch: route.fetch }).catch((error: unknown) => {
			routeClients.delete(route);
			throw error;
		});
		routeClients.set(route, client);
	}
	return client;
}

/** "로봇이 아닌지 확인" 응답은 HTTP 200으로 와요 — 경로 차단으로 알리고 던져요. 나이 제한 같은 다른 LOGIN_REQUIRED는 그대로 둬요. */
export function assertNotBotChecked(route: OutboundRoute, playability: { status?: string; reason?: string } | undefined): void {
	if (playability?.status === 'LOGIN_REQUIRED' && /not a bot/i.test(playability.reason ?? '')) {
		throw route.blocked('bot check');
	}
}
