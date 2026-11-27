import type { Env } from '../config/env.ts';
import { sharedCache } from '../utils/cache.ts';
import { getLogger } from '../utils/logger.ts';
import { parseClock } from '../utils/parseClock.ts';
import { fetchOhaasaRaw, getTodayDateString, ohaasaCacheKey } from '../providers/ohaasa.ts';
import { translateDaily, type TranslationProvider } from '../providers/translate.ts';
import type { DailyHoroscope } from '../providers/types.ts';

const logger = getLogger('ohaasa-scheduler');

const REDIS_TTL_SECONDS = 7 * 24 * 3600;
const LOCK_TTL_SECONDS = 90;
const JITTER_MAX_MS = 20 * 60_000;

let lastGood: DailyHoroscope | null = null;
let lastRefreshAt: number | null = null;
let lastSource: string | null = null;

export function ohaasaStatus(): {
	date: string | null;
	refreshedAt: number | null;
	source: string | null;
} {
	return {
		date: lastGood?.date ?? null,
		refreshedAt: lastRefreshAt,
		source: lastSource
	};
}

export function lastGoodDaily(): DailyHoroscope | null {
	return lastGood;
}

export async function refreshOnce(provider: TranslationProvider | null): Promise<DailyHoroscope> {
	const raw = await fetchOhaasaRaw();
	const key = ohaasaCacheKey(raw.date);
	const commit = async (daily: DailyHoroscope, source: string): Promise<void> => {
		lastGood = daily;
		lastRefreshAt = Date.now();
		lastSource = source;
		await sharedCache.set(key, JSON.stringify(daily), REDIS_TTL_SECONDS);
	};

	if (!provider || !provider.available) {
		await commit(raw, 'raw');
		return raw;
	}

	const acquired = await sharedCache.acquireLock(`${key}:lock`, LOCK_TTL_SECONDS);
	if (!acquired) return raw;

	try {
		const daily = await translateDaily(raw, provider);
		await commit(daily, 'translated');
		logger.info(`ohaasa refreshed: ${daily.date} (translated)`);
		return daily;
	} catch (error) {
		logger.warn('ohaasa translation failed, serving raw:', String(error));
		await commit(raw, 'raw-fallback');
		return raw;
	}
}

// KST-adjusted UTC target (unlike memoryTidy's server-local schedule).
function msUntilNextRefresh(refreshAt: string): number {
	const KST_OFFSET_MS = 9 * 3600_000;
	const { hour, minute } = parseClock(refreshAt, { hour: 6, minute: 50 });
	const now = Date.now();
	const seoul = new Date(now + KST_OFFSET_MS);
	const jitter = Math.floor(Math.random() * JITTER_MAX_MS);
	const target = Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), seoul.getUTCDate(), hour, minute) - KST_OFFSET_MS + jitter;
	return Math.max(60_000, (target > now ? target : target + 24 * 3600_000) - now);
}

export function startOhaasaScheduler(env: Env, provider: TranslationProvider | null): () => void {
	let stopped = false;
	let timer: NodeJS.Timeout | null = null;

	const tick = async () => {
		if (stopped) return;
		try {
			await refreshOnce(provider);
		} catch (error) {
			logger.warn('ohaasa refresh failed:', String(error));
		} finally {
			if (!stopped) {
				timer = setTimeout(() => void tick(), msUntilNextRefresh(env.OHAASA_REFRESH_AT));
				timer.unref?.();
			}
		}
	};

	void (async () => {
		const todayKey = ohaasaCacheKey(getTodayDateString());
		const existing = await sharedCache.get(todayKey);
		if (existing) {
			try {
				lastGood = JSON.parse(existing) as DailyHoroscope;
				lastRefreshAt = Date.now();
				lastSource = 'cache-warm';
			} catch {}
		}
		if (!lastGood && !stopped) await tick();
		else if (!stopped) {
			timer = setTimeout(() => void tick(), msUntilNextRefresh(env.OHAASA_REFRESH_AT));
			timer.unref?.();
		}
	})();

	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
}
