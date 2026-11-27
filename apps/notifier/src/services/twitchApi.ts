import { createHmac, timingSafeEqual } from 'node:crypto';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('twitchApi');

export type TwitchFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const HELIX_BASE = 'https://api.twitch.tv/helix';
const REQUEST_TIMEOUT_MS = 8_000;
const EVENTSUB_MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
// Refresh the app token this long before Twitch says it expires, but never cache it for less than the floor.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const TOKEN_MIN_LIFETIME_MS = 60_000;

interface AppTokenResponse {
	access_token: string;
	expires_in: number;
	token_type: string;
}

export interface TwitchUser {
	id: string;
	login: string;
	displayName: string;
}

export interface CreatedSubscription {
	subscriptionId: string;
}

export function verifyEventSubSignature(
	rawBody: string,
	messageId: string,
	messageTimestamp: string,
	signatureHeader: string,
	secret: string
): boolean {
	const expected = `sha256=${createHmac('sha256', secret)
		.update(messageId + messageTimestamp + rawBody)
		.digest('hex')}`;
	if (expected.length !== signatureHeader.length) return false;
	return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

export function isEventSubTimestampFresh(
	messageTimestamp: string,
	now: number = Date.now(),
	maxSkewMs: number = EVENTSUB_MAX_CLOCK_SKEW_MS
): boolean {
	const timestampMs = Date.parse(messageTimestamp);
	if (!Number.isFinite(timestampMs)) return false;
	return Math.abs(now - timestampMs) <= maxSkewMs;
}

export class TwitchApiClient {
	private readonly fetchFn: TwitchFetchFn;
	private token: string | null = null;
	private tokenExpiresAt = 0;

	public constructor(
		private readonly options: {
			clientId: string;
			clientSecret: string;
			fetchFn?: TwitchFetchFn;
		}
	) {
		this.fetchFn = options.fetchFn ?? fetch;
	}

	private async fetchAppToken(): Promise<string> {
		const url = `${TOKEN_URL}?${new URLSearchParams({
			client_id: this.options.clientId,
			client_secret: this.options.clientSecret,
			grant_type: 'client_credentials'
		})}`;
		const response = await this.fetchFn(url, { method: 'POST', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		if (!response.ok) throw new Error(`Twitch app token 발급 실패: HTTP ${response.status}`);
		const body = (await response.json()) as AppTokenResponse;
		if (!body.access_token) throw new Error('Twitch app token 응답에 access_token이 없어요.');
		this.token = body.access_token;
		this.tokenExpiresAt = Date.now() + Math.max(body.expires_in * 1000 - TOKEN_REFRESH_MARGIN_MS, TOKEN_MIN_LIFETIME_MS);
		return this.token;
	}

	private async getAccessToken(): Promise<string> {
		if (!this.token || Date.now() >= this.tokenExpiresAt) await this.fetchAppToken();
		return this.token!;
	}

	private async helix(url: string, init: RequestInit): Promise<Response> {
		const send = (accessToken: string) =>
			this.fetchFn(url, {
				...init,
				headers: {
					'Client-Id': this.options.clientId,
					Authorization: `Bearer ${accessToken}`,
					...init.headers
				},
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
			});
		let response = await send(await this.getAccessToken());
		if (response.status === 401) {
			logger.warn('Twitch 토큰이 거부됐어요. 재발급 후 재시도해요.');
			this.token = null;
			response = await send(await this.getAccessToken());
		}
		return response;
	}

	public async getTwitchUser(login: string): Promise<TwitchUser | null> {
		const url = `${HELIX_BASE}/users?${new URLSearchParams({ login })}`;
		const response = await this.helix(url, { method: 'GET' });
		if (!response.ok) throw new Error(`Twitch 사용자 조회 실패: HTTP ${response.status}`);
		const body = (await response.json()) as { data?: Array<{ id: string; login: string; display_name: string }> };
		const user = body.data?.[0];
		if (!user) return null;
		return { id: user.id, login: user.login, displayName: user.display_name };
	}

	public async createStreamOnlineSubscription(options: {
		broadcasterUserId: string;
		callbackUrl: string;
		secret: string;
	}): Promise<CreatedSubscription | null> {
		const response = await this.helix(`${HELIX_BASE}/eventsub/subscriptions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				type: 'stream.online',
				version: '1',
				condition: { broadcaster_user_id: options.broadcasterUserId },
				transport: { method: 'webhook', callback: options.callbackUrl, secret: options.secret }
			})
		});
		if (!response.ok) {
			const detail = await response.text().catch(() => '');
			throw new Error(`Twitch EventSub 구독 생성 실패: HTTP ${response.status} ${detail.slice(0, 200)}`);
		}
		const body = (await response.json()) as { data?: Array<{ id: string }> };
		const subscriptionId = body.data?.[0]?.id;
		if (!subscriptionId) return null;
		return { subscriptionId };
	}

	public async deleteSubscription(subscriptionId: string): Promise<boolean> {
		const url = `${HELIX_BASE}/eventsub/subscriptions?${new URLSearchParams({ id: subscriptionId })}`;
		const response = await this.helix(url, { method: 'DELETE' });
		return response.ok || response.status === 404;
	}
}
