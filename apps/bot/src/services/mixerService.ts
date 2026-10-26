import { container } from '@sapphire/framework';
import type { Player, Track } from 'lavalink-client';
import { randomUUID } from 'node:crypto';
import type { CustomPlayer, OverrideAction } from '../modules/audio/lavalink/player/customPlayer.ts';
import { commitLocal, sendOverride } from '../modules/audio/lavalink/handlers/mixerHandlers.ts';
import { cancelPendingInvalidate } from '../modules/audio/lavalink/queue/queueWrapper.ts';
const MIXER_FILTER_KEY = 'mixer';
const MIXER_CALL_TIMEOUT_MS = Number(process.env.MIXER_CALL_TIMEOUT_MS) || 5_000;

export interface MixerStateResponse {
	guildId: string;
	protocolVersion?: number;
	state?: string;
	lastKnownEpoch?: number;
	crossfadeEnabled: boolean;
	crossfadeMs: number;
	fadeInMs: number;
	duckLevel: number;
	normalizationEnabled?: boolean;
	silenceEnabled?: boolean;
	silenceThresholdDb?: number;
	tailConfirmMs?: number;
	nextTrimMs?: [number, number] | null;
	announcementsQueued?: number;
	hasNext?: boolean;
	crossfadeActive?: boolean;
}

export interface MixerAnnounceReceipt {
	guildId: string;
	id: number;
	position: number;
	queueLength: number;
}

export interface ArmRequestOptions {
	epoch: number;
	encodedTrack: string | null;
	isEmpty?: boolean;
}

export interface OverrideRequestOptions {
	epoch: number;
	action: OverrideAction;
	encodedTrack?: string | null;
}

export class MixerRequestError extends Error {
	public lastKnownEpoch?: number;
	public v2WindowOpenAt?: number;

	public constructor(
		public readonly status: number,
		message: string,
		extra?: { lastKnownEpoch?: number; v2WindowOpenAt?: number }
	) {
		super(message);
		this.name = 'MixerRequestError';
		this.lastKnownEpoch = extra?.lastKnownEpoch;
		this.v2WindowOpenAt = extra?.v2WindowOpenAt;
	}
}

/**
 * Lavalink mixer-plugin REST client (v2 Protocol).
 * All v2 state transitions and audio controls route through this service.
 */
export class MixerService {
	private readonly filterReady = new Set<string>();
	/** Guild-isolated Promise serial queue to enforce strict ordering of REST mutations. */
	private readonly chains = new Map<string, Promise<unknown>>();
	/** Pending invalidate coalescence per guild. */
	private readonly pendingInvalidate = new Map<string, { epoch: number; resolve: () => void; reject: (e: Error) => void }>();

	private nodeRest(player: Player): { base: string; auth: string } {
		const o = (player.node?.options ?? {}) as { host?: string; port?: number; authorization?: string; secure?: boolean };
		const proto = o.secure ? 'https' : 'http';
		return { base: `${proto}://${o.host}:${o.port}`, auth: o.authorization ?? '' };
	}

	private async rawCall(
		player: Player,
		path: string,
		init?: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal }
	): Promise<any> {
		const { base, auth } = this.nodeRest(player);
		let res: Response;
		try {
			res = await fetch(`${base}${path}`, {
				method: init?.method ?? 'GET',
				body: init?.body,
				headers: {
					Authorization: auth,
					'Content-Type': 'application/json',
					...(init?.headers ?? {})
				},
				signal: init?.signal ?? AbortSignal.timeout(MIXER_CALL_TIMEOUT_MS)
			});
		} catch (error: any) {
			if (error?.name === 'AbortError') {
				throw new MixerRequestError(504, `mixer ${path} -> request aborted / timeout`);
			}
			throw new MixerRequestError(504, `mixer ${path} -> unreachable: ${error instanceof Error ? error.message : String(error)}`);
		}

		if (res.status === 204) return null;
		let text: string;
		try {
			text = await res.text();
		} catch (error) {
			throw new MixerRequestError(502, `mixer ${path} -> body read failed: ${error instanceof Error ? error.message : String(error)}`);
		}

		let body: any = null;
		try {
			body = text ? JSON.parse(text) : null;
		} catch {
			body = { message: text };
		}

		if (!res.ok) {
			throw new MixerRequestError(res.status, `mixer ${path} -> ${res.status}: ${body?.message ?? text}`, {
				lastKnownEpoch: body?.lastKnownEpoch,
				v2WindowOpenAt: body?.v2WindowOpenAt
			});
		}
		return body;
	}

	/**
	 * Enqueues an operation into the guild's serial Promise chain with 2s timeout and 1 fresh retry.
	 */
	public enqueue<T>(guildId: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
		const prev = this.chains.get(guildId) ?? Promise.resolve();
		const next = prev.catch(() => {}).then(() => this.attempt(fn));
		this.chains.set(guildId, next);
		return next;
	}

	private async attempt<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
		for (let i = 0; i < 2; i++) {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 2000);
			try {
				return await fn(controller.signal);
			} catch (err: any) {
				if (i === 1) throw err;
				// Do not retry 4xx errors (client faults / protocol fencing)
				if (err instanceof MixerRequestError && err.status >= 400 && err.status < 500) {
					throw err;
				}
			} finally {
				clearTimeout(timer);
			}
		}
		throw new Error('unreachable');
	}

	// ---------------------------------------------------------------------------
	// v2 Protocol REST Endpoints
	// ---------------------------------------------------------------------------

	public async arm(player: CustomPlayer, opts: ArmRequestOptions, idemKey: string = randomUUID()): Promise<unknown> {
		const gid = String(player.guildId);
		return this.enqueue(gid, (signal) =>
			this.rawCall(player, '/mixer/queue/arm', {
				method: 'POST',
				body: JSON.stringify({
					guildId: gid,
					epoch: opts.epoch,
					encodedTrack: opts.encodedTrack,
					isEmpty: !!opts.isEmpty
				}),
				headers: { 'Idempotency-Key': idemKey },
				signal
			})
		);
	}

	public async invalidate(player: CustomPlayer, epoch: number): Promise<void> {
		const gid = String(player.guildId);
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		const old = this.pendingInvalidate.get(gid);
		if (old) {
			old.resolve();
		}
		this.pendingInvalidate.set(gid, { epoch, resolve, reject });

		void this.enqueue(gid, async (signal) => {
			const item = this.pendingInvalidate.get(gid);
			this.pendingInvalidate.delete(gid);
			if (!item) return;
			try {
				await this.rawCall(player, '/mixer/queue/invalidate', {
					method: 'POST',
					body: JSON.stringify({ guildId: gid, epoch: item.epoch }),
					headers: { 'Idempotency-Key': randomUUID() },
					signal
				});
				item.resolve();
			} catch (err: unknown) {
				item.reject(err instanceof Error ? err : new Error(String(err)));
			}
		});
		return promise;
	}

	public async override(player: CustomPlayer, opts: OverrideRequestOptions, idemKey: string = randomUUID()): Promise<unknown> {
		const gid = String(player.guildId);
		return this.enqueue(gid, (signal) =>
			this.rawCall(player, '/mixer/queue/override', {
				method: 'POST',
				body: JSON.stringify({
					guildId: gid,
					epoch: opts.epoch,
					action: opts.action,
					encodedTrack: opts.encodedTrack ?? undefined
				}),
				headers: { 'Idempotency-Key': idemKey },
				signal
			})
		);
	}

	/**
	 * User Skip: advances local queue first (commitLocal) and sends PLAY_NOW override.
	 * If target position is given, drops tracks up to that index.
	 */
	public async skip(player: CustomPlayer, position?: number): Promise<void> {
		if (typeof position === 'number' && position > 1) {
			const dropCount = Math.min(position - 1, player.queue.tracks.length);
			player.queue.tracks.splice(0, dropCount);
		}

		const next = player.queue.tracks[0] as Track | undefined;
		if (!next) {
			player.queue.current = null;
			container.playerNotifier.updateController(player);
			await sendOverride(player, 'STOP', null);
			return;
		}

		commitLocal(player, next, { invalidate: false });
		cancelPendingInvalidate(player);
		await sendOverride(player, 'PLAY_NOW', next.encoded ?? null);
	}
	public async reset(player: CustomPlayer, epoch: number, idemKey: string = randomUUID()): Promise<unknown> {
		const gid = String(player.guildId);
		return this.enqueue(gid, (signal) =>
			this.rawCall(player, '/mixer/reset', {
				method: 'POST',
				body: JSON.stringify({ guildId: gid, epoch }),
				headers: { 'Idempotency-Key': idemKey },
				signal
			})
		);
	}

	public async getState(player: Player): Promise<MixerStateResponse> {
		const gid = encodeURIComponent(String(player.guildId));
		return (await this.rawCall(player, `/mixer/state?guildId=${gid}`)) as MixerStateResponse;
	}

	public async getInfo(player: Player): Promise<{ protocolVersion: number; version: string }> {
		return (await this.rawCall(player, '/mixer/info')) as { protocolVersion: number; version: string };
	}
	public async clearNext(_player: Player): Promise<void> {
		// v2: slot is managed by JIT; clearNext is a no-op
	}
	public async preloadUpcoming(_player: Player): Promise<void> {
		// v2: preloading is JIT-driven via MixerNeedNextTrackEvent
	}

	public async primeForPlay(player: Player): Promise<void> {
		await this.ensureMixerFilter(player).catch(() => null);
	}

	public async clearNextLenient(_player: Player): Promise<void> {
		// v2: slot is JIT-managed
	}

	public async reconcileAfterResume(_player: Player): Promise<void> {
		// v2: handled by sessionRestore.ts resetV2 call
	}
	public isPreloaded(_guildId: string): boolean {
		return false;
	}

	public isOverlapActive(_guildId: string): boolean {
		return false;
	}

	public getOverlapTrackIdentifier(_guildId: string): string | null {
		return null;
	}

	public consumePreloaded(_guildId: string): boolean {
		return false;
	}

	public consumeOverlapAbort(_guildId: string): boolean {
		return false;
	}

	public markUnmanaged(_guildId: string): void {
		// no-op in v2
	}

	public takePreloadedIdentifier(_guildId: string): string | null {
		return null;
	}

	public observeMixerEvent(_payload: unknown): void {
		// v2 events are routed via nodeHandler to mixerHandlers
	}

	public async setCrossfade(player: Player, enabled: boolean, durationMs?: number): Promise<MixerStateResponse> {
		return (await this.rawCall(player, '/mixer/crossfade', {
			method: 'POST',
			body: JSON.stringify({ guildId: String(player.guildId), enabled, durationMs })
		})) as MixerStateResponse;
	}

	public async setNormalization(player: Player, enabled: boolean): Promise<MixerStateResponse> {
		return (await this.rawCall(player, '/mixer/normalization', {
			method: 'POST',
			body: JSON.stringify({ guildId: String(player.guildId), enabled })
		})) as MixerStateResponse;
	}

	public async reapplyMixerFilter(player: Player): Promise<void> {
		this.filterReady.delete(String(player.guildId));
		await this.ensureMixerFilter(player).catch((error) => {
			container.logger.warn(`[mixer] mixer filter re-apply failed (guild ${player.guildId}): ${error}`);
		});
	}

	// ---------------------------------------------------------------------------
	// Configuration & Filters
	// ---------------------------------------------------------------------------

	public async enableMixerFilter(player: Player): Promise<void> {
		const fm = player.filterManager;
		fm.data.pluginFilters = {
			...((fm.data.pluginFilters ?? {}) as Record<string, unknown>),
			[MIXER_FILTER_KEY]: { guildId: String(player.guildId) }
		} as any;
		await fm.applyPlayerFilters();
	}

	public async pushCrossfadeConfig(player: Player): Promise<void> {
		const settings = await container.guildService.getMixerSettings(player.guildId);
		const durationMs = Math.min(15000, Math.max(500, settings.crossfadeMs));
		await this.rawCall(player, '/mixer/crossfade', {
			method: 'POST',
			body: JSON.stringify({ guildId: String(player.guildId), enabled: settings.crossfadeEnabled, durationMs })
		});
		await this.pushNormalizationConfig(player);
	}

	public async pushNormalizationConfig(player: Player): Promise<void> {
		const settings = await container.guildService.getMixerSettings(player.guildId);
		await this.rawCall(player, '/mixer/normalization', {
			method: 'POST',
			body: JSON.stringify({ guildId: String(player.guildId), enabled: settings.normalizationEnabled })
		});
	}

	public async ensureMixerFilter(player: Player): Promise<void> {
		const gid = String(player.guildId);
		if (this.filterReady.has(gid)) return;
		await this.enableMixerFilter(player);
		await this.pushCrossfadeConfig(player);
		this.filterReady.add(gid);
	}

	public resetFilterReadiness(): void {
		this.filterReady.clear();
	}

	public markFiltersStale(guildId: string): void {
		this.filterReady.delete(String(guildId));
	}

	public async announce(player: Player, identifier: string, duckLevel: number, mode?: 'sequential' | 'parallel'): Promise<MixerAnnounceReceipt> {
		return (await this.rawCall(player, '/mixer/announce', {
			method: 'POST',
			body: JSON.stringify({ guildId: String(player.guildId), identifier, duckLevel, ...(mode ? { mode } : {}) })
		})) as MixerAnnounceReceipt;
	}
}
