import type { FastifyInstance } from 'fastify';
import { getLogger } from '../utils/logger.ts';
import { metrics } from '../utils/metrics.ts';
import { serveCached } from './serveCached.ts';
import { sendError } from './common.ts';
import { fetchOhaasaRaw, getTodayDateString, ohaasaCacheKey } from '../providers/ohaasa.ts';
import { translateDaily } from '../providers/translate.ts';
import type { OpenAICompatTranslationProvider } from '../providers/translate.ts';
import { lastGoodDaily } from '../services/ohaasaScheduler.ts';

const logger = getLogger('ohaasaRoute');

export function registerOhaasaRoutes(fastify: FastifyInstance, deps: { translationProvider: OpenAICompatTranslationProvider }): void {
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
							logger.warn(`ohaasa translation failed, serving raw: ${error instanceof Error ? error.message : String(error)}`);
							return raw;
						}
					}
					return raw;
				},
				validate: (d) => Array.isArray(d.horoscopes) && d.horoscopes.length > 0
			}).catch(async (error) => {
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
}
