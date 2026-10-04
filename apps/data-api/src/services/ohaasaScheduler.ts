import type { Env } from '../config/env.ts';
import { sharedCache } from '../utils/cache.ts';
import { getLogger } from '../utils/logger.ts';
import { fetchOhaasaRaw, getTodayDateString, ohaasaCacheKey } from '../providers/ohaasa.ts';
import { translateDaily, type TranslationProvider } from '../providers/translate.ts';
import type { DailyHoroscope } from '../providers/types.ts';

const logger = getLogger('ohaasa-scheduler');

const REDIS_TTL_SECONDS = 7 * 24 * 3600;
const LOCK_TTL_SECONDS = 90;
const JITTER_MAX_MS = 20 * 60_000;

function parseTime(value: string): { hour: number; minute: number } {
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	const hour = match ? Number(match[1]) : 6;
	const minute = match ? Number(match[2]) : 50;
	return {
		hour: Math.min(23, Math.max(0, hour)),
		minute: Math.min(59, Math.max(0, minute))
	};
}

/** 마지막 성공 본 (upstream 전멸 시 stale 폴백용) */
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

async function refreshOnce(provider: TranslationProvider | null): Promise<DailyHoroscope> {
	const raw = await fetchOhaasaRaw();
	const key = ohaasaCacheKey(raw.date);

	if (!provider || !provider.available) {
		lastGood = raw;
		lastRefreshAt = Date.now();
		lastSource = 'raw';
		await sharedCache.set(key, JSON.stringify(raw), REDIS_TTL_SECONDS);
		return raw;
	}

	// 단일 레플리카라 in-process면 충분하지만, 확장 대비 Redis 락도 걸어요
	const acquired = await sharedCache.acquireLock(`${key}:lock`, LOCK_TTL_SECONDS);
	if (!acquired) return raw;

	try {
		const daily = await translateDaily(raw, provider);
		lastGood = daily;
		lastRefreshAt = Date.now();
		lastSource = 'translated';
		await sharedCache.set(key, JSON.stringify(daily), REDIS_TTL_SECONDS);
		logger.info(`ohaasa refreshed: ${daily.date} (translated)`);
		return daily;
	} catch (error) {
		logger.warn('ohaasa translation failed, serving raw:', String(error));
		lastGood = raw;
		lastRefreshAt = Date.now();
		lastSource = 'raw-fallback';
		await sharedCache.set(key, JSON.stringify(raw), REDIS_TTL_SECONDS);
		return raw;
	}
}

function msUntilNextRefresh(refreshAt: string): number {
	const KST_OFFSET_MS = 9 * 3600_000;
	const { hour, minute } = parseTime(refreshAt);
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

	// 부팅 시 캐시 워밍 (오늘 키가 있으면 스케줄만, 없으면 즉시 갱신)
	void (async () => {
		const todayKey = ohaasaCacheKey(getTodayDateString());
		const existing = await sharedCache.get(todayKey);
		if (existing) {
			try {
				lastGood = JSON.parse(existing) as DailyHoroscope;
				lastRefreshAt = Date.now();
				lastSource = 'cache-warm';
			} catch {
				// 손상된 캐시는 무시하고 갱신
			}
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

export async function refreshOhaasaNow(provider: TranslationProvider | null): Promise<DailyHoroscope> {
	return refreshOnce(provider);
}
