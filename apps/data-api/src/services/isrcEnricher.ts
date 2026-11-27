import { createDeezerProvider, createMusicBrainzProvider, type IsrcProvider, IsrcProviderError, resolveIsrc } from '@sirubot/isrc';
import type { PrismaClient } from '@sirubot/prisma';
import { breaker } from '../utils/breaker.ts';
import { getLogger } from '../utils/logger.ts';
import { metrics } from '../utils/metrics.ts';
import { applyTrackIsrc, type ApplyIsrcResult } from './recordingMerge.ts';

const logger = getLogger('isrc-enricher');

const INTERVAL_MS = 10 * 60_000;
const RETRY_AFTER_MS = 30 * 24 * 60 * 60_000;

export interface IsrcEnrichStats {
	running: boolean;
	lastRunAt: number | null;
	lastRunTracks: number;
	found: number;
	inherited: number;
	notFound: number;
	failed: number;
	merged: number;
	conflicts: number;
}

function guarded(provider: IsrcProvider): IsrcProvider {
	const name = `isrc:${provider.name}`;
	return {
		name: provider.name,
		async search(terms, ctx) {
			if (!breaker.canAttempt(name)) throw new IsrcProviderError(provider.name, 'circuit open');
			const started = Date.now();
			try {
				const result = await provider.search(terms, ctx);
				breaker.recordSuccess(name);
				metrics.upstream(name, Date.now() - started, true);
				return result;
			} catch (error) {
				breaker.recordFailure(name);
				metrics.upstream(name, Date.now() - started, false);
				throw error;
			}
		}
	};
}

export function createIsrcProviders(options: { musicBrainzUserAgent?: string } = {}): IsrcProvider[] {
	return [createDeezerProvider(), createMusicBrainzProvider({ userAgent: options.musicBrainzUserAgent })].map(guarded);
}

export class IsrcEnricher {
	private readonly stats: IsrcEnrichStats = {
		running: false,
		lastRunAt: null,
		lastRunTracks: 0,
		found: 0,
		inherited: 0,
		notFound: 0,
		failed: 0,
		merged: 0,
		conflicts: 0
	};

	public constructor(
		private readonly db: PrismaClient,
		private readonly providers: IsrcProvider[],
		private readonly batchSize: number
	) {}

	public status(): IsrcEnrichStats {
		return { ...this.stats };
	}

	public async runBatch(limit = this.batchSize): Promise<IsrcEnrichStats> {
		if (this.stats.running) return this.status();
		this.stats.running = true;
		this.stats.lastRunAt = Date.now();
		try {
			const tracks = await this.db.track.findMany({
				where: { isrc: null, OR: [{ isrcCheckedAt: null }, { isrcCheckedAt: { lt: new Date(Date.now() - RETRY_AFTER_MS) } }] },
				orderBy: [{ totalPlays: 'desc' }, { id: 'asc' }],
				take: limit,
				select: { id: true, title: true, artist: true, duration: true, source: true }
			});
			this.stats.lastRunTracks = tracks.length;
			for (const track of tracks) await this.enrichOne(track);
		} catch (error) {
			logger.error('isrc enrich batch failed:', String(error));
		} finally {
			this.stats.running = false;
		}
		return this.status();
	}

	private async enrichOne(track: { id: string; title: string; artist: string; duration: number; source: string }) {
		try {
			// Re-fetch in case an earlier track in this batch already populated the recording ISRC.
			const fresh = await this.db.track.findUnique({ where: { id: track.id }, select: { isrc: true, recording: { select: { isrc: true } } } });
			if (!fresh || fresh.isrc) return;
			if (fresh.recording?.isrc) {
				this.count(await applyTrackIsrc(this.db, track.id, fresh.recording.isrc, 'recording'));
				this.stats.inherited++;
				return;
			}
			const { match, failedProviders } = await resolveIsrc(
				{ artist: track.artist, title: track.title, durationMs: track.duration, sourceName: track.source },
				{ providers: this.providers }
			);
			if (match) {
				this.stats.found++;
				this.count(await applyTrackIsrc(this.db, track.id, match.isrc, match.provider));
			} else if (failedProviders.length === 0) {
				// Only mark checked when all providers cleanly report not found.
				this.stats.notFound++;
				await this.db.track.update({ where: { id: track.id }, data: { isrcCheckedAt: new Date() } });
			} else {
				this.stats.failed++;
			}
		} catch (error) {
			this.stats.failed++;
			logger.warn(`isrc enrich failed: ${track.id}`, String(error));
		}
	}

	private count(result: ApplyIsrcResult) {
		if (result === 'merged') this.stats.merged++;
		if (result === 'conflict') {
			this.stats.conflicts++;
			logger.warn('isrc conflict: recording already has a different ISRC');
		}
	}
}

let active: IsrcEnricher | null = null;

export function isrcEnrichStatus(): IsrcEnrichStats | null {
	return active?.status() ?? null;
}

export function startIsrcEnrichScheduler(enricher: IsrcEnricher | null, options: { enabled: boolean }): () => void {
	active = enricher && options.enabled ? enricher : null;
	if (!enricher || !options.enabled) {
		logger.warn(`isrc enricher disabled (db: ${Boolean(enricher)}, enabled: ${options.enabled})`);
		return () => undefined;
	}
	let stopped = false;
	let timer: NodeJS.Timeout | null = null;
	const tick = () => {
		if (stopped) return;
		timer = setTimeout(() => {
			if (stopped) return;
			void enricher.runBatch().finally(tick);
		}, INTERVAL_MS);
		timer.unref?.();
	};
	tick();
	return () => {
		stopped = true;
		active = null;
		if (timer) clearTimeout(timer);
	};
}
