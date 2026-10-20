import type { FastifyInstance } from 'fastify';
import { metrics } from '../utils/metrics.ts';
import { serveCached } from './serveCached.ts';
import { sendError } from './common.ts';
import { fetchOhaasaRaw, getTodayDateString, ohaasaCacheKey } from '../providers/ohaasa.ts';
import { translateDaily } from '../providers/translate.ts';
import type { OpenAICompatTranslationProvider } from '../providers/translate.ts';
import { lastGoodDaily, refreshOhaasaNow } from '../services/ohaasaScheduler.ts';

/** 오하아사(오늘의 운세) 캐시 서빙 + 수동 갱신 — 스크래핑·번역 스케줄러는 services/ohaasaScheduler.ts가 소유해요. */

export function registerOhaasaRoutes(fastify: FastifyInstance, deps: { translationProvider: OpenAICompatTranslationProvider }): void {
	// ── 오하아사 (오늘 JST 키 단일화: 캐시는 항상 번역본) ──
	fastify.get('/v1/ohaasa', async (_request, reply) => {
		try {
			const { data, cached } = await serveCached({
				route: 'ohaasa',
				key: ohaasaCacheKey(getTodayDateString()),
				ttlSeconds: 7 * 24 * 3600,
				provider: 'ohaasa',
				fetchFresh: async () => {
					const raw = await fetchOhaasaRaw();
					if (deps.translationProvider.available) {
						try {
							return await translateDaily(raw, deps.translationProvider);
						} catch (error) {
							// 조용히 원문으로 빠지면 왜 그런지 로그에 남지 않아요 (quota 초과 등)
							console.warn(
								`[data-api] ohaasa translation failed, serving raw: ${error instanceof Error ? error.message : String(error)}`
							);
							return raw;
						}
					}
					return raw;
				},
				validate: (d) => Array.isArray(d.horoscopes) && d.horoscopes.length > 0
			}).catch(async (error) => {
				// upstream 전멸 → 스케줄러의 마지막 성공 본
				const stale = lastGoodDaily();
				if (stale) {
					metrics.hit('ohaasa');
					return { data: stale, cached: true as boolean };
				}
				throw error;
			});
			return reply.send({ ...data, _cached: cached });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.post('/v1/ohaasa/refresh', async (_request, reply) => {
		try {
			const daily = await refreshOhaasaNow(deps.translationProvider.available ? deps.translationProvider : null);
			return reply.send(daily);
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
