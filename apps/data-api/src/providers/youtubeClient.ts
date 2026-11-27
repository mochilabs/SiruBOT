import { Innertube } from 'youtubei.js';
import type { OutboundRoute } from '../utils/proxyPool.ts';

const YOUTUBE_TIMEOUT_MS = 10_000;
let clientPromise: Promise<Innertube> | null = null;
const routeClients = new WeakMap<OutboundRoute, Promise<Innertube>>();

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

// Bot-check arrives as HTTP 200; treat it as route-blocked while leaving age/other checks alone.
export function assertNotBotChecked(route: OutboundRoute, playability: { status?: string; reason?: string } | undefined): void {
	if (playability?.status === 'LOGIN_REQUIRED' && /not a bot/i.test(playability.reason ?? '')) {
		throw route.blocked('bot check');
	}
}
