import { createDeezerProvider, createMusicBrainzProvider, type IsrcProvider, IsrcProviderError, resolveIsrc } from '@sirubot/isrc';
import type { PrismaClient } from '@sirubot/prisma';
import { breaker } from '../utils/breaker.ts';
import { getLogger } from '../utils/logger.ts';
import { metrics } from '../utils/metrics.ts';
import { applyTrackIsrc, type ApplyIsrcResult } from './recordingMerge.ts';

const logger = getLogger('isrc-enricher');

const INTERVAL_MS = 10 * 60_000;
/** 못 찾은 곡은 이 기간이 지나면 다시 찾아봐요 (카탈로그에 나중에 올라오는 경우). */
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

/** 프로바이더를 서킷 브레이커·메트릭으로 감싸요. 열린 브레이커는 장애로 보고해 isrcCheckedAt을 남기지 않아요. */
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
	// Deezer는 라틴 표기, MusicBrainz는 원어 표기에 강해요 (packages/isrc/AGENTS.md).
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

	/** ISRC가 없는 Track 한 배치 — 처음 본 곡(isrcCheckedAt null)과 재시도 기한이 지난 곡, 많이 재생된 순. */
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
			// 같은 배치의 앞선 곡이 묶음에 ISRC를 채웠을 수 있어요 — 최신 상태로 다시 봐요.
			const fresh = await this.db.track.findUnique({ where: { id: track.id }, select: { isrc: true, recording: { select: { isrc: true } } } });
			if (!fresh || fresh.isrc) return;
			// 묶음이 이미 ISRC를 알면 외부 조회 없이 물려받아요.
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
				// 모든 프로바이더가 "없음"이라고 답했을 때만 조회 완료로 남겨요. 장애면 다음 배치에서 다시 봐요.
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

/** /status용 — 스케줄러가 꺼져 있으면 null */
export function isrcEnrichStatus(): IsrcEnrichStats | null {
	return active?.status() ?? null;
}

/** 10분마다 배치를 돌려요. DB가 없거나 꺼져 있으면 아무것도 하지 않아요. */
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
