import type { FastifyInstance } from 'fastify';
import { sharedCache } from '../utils/cache.ts';
import { breaker } from '../utils/breaker.ts';
import { outboundPool } from '../utils/proxyPool.ts';
import { inflightCount } from '../utils/dedup.ts';
import { metrics } from '../utils/metrics.ts';
import type { OpenAICompatTranslationProvider } from '../providers/translate.ts';
import { ohaasaStatus } from '../services/ohaasaScheduler.ts';
import { playbackSnapshot } from '../services/playbackStore.ts';
import { memoryTidyStatus } from '../services/memoryTidy.ts';
import { isrcEnrichStatus } from '../services/isrcEnricher.ts';
import { playerHubStatus } from '../services/playerHub.ts';
import { guildDataHubStatus } from '../services/guildDataHub.ts';
import { registerDashboard } from './dashboard.ts';
import { registerSocialRoutes } from './social.ts';
import { registerOhaasaRoutes } from './ohaasa.ts';
import { registerEmbedFixRoutes } from './embed-fix.ts';
import { registerCacheProviderRoutes } from './cache-providers.ts';
import { registerRenderRoutes } from './render.ts';
import { registerAiRoutes } from './ai.ts';
import { registerPlayerRoutes } from './player.ts';
import { registerGuildDataRoutes } from './guild-data.ts';
import { registerStorageProxyRoutes } from './storage.ts';
import { registerTtsRoutes } from './tts.ts';
import { registerBotAdminRoutes } from './bot-admin.ts';
import { registerGiveawayRoutes } from './giveaway.ts';
import { registerPanelRoutes } from './panel.ts';
import { registerIncidentNoticeRoutes } from './incident-notice.ts';

export interface RouteDeps {
	translationProvider: OpenAICompatTranslationProvider;
	draftProvider: OpenAICompatTranslationProvider;
	lavalinkRestUrl?: string;
	lavalinkPassword?: string;
	notifierUrl?: string;
	notifierAuthKey?: string;
	storageUrl?: string;
	storageAuthKey?: string;
	ttsUrl?: string;
}

export async function registerRoutes(fastify: FastifyInstance, deps: RouteDeps): Promise<void> {
	fastify.get('/api/health', async () => ({
		ok: true,
		service: 'data-api',
		redis: sharedCache.connected
	}));

	registerDashboard(fastify);

	fastify.get('/v1/status', async () => ({
		ok: true,
		redis: sharedCache.connected,
		cache: sharedCache.stats(),
		inflight: inflightCount(),
		routes: metrics.snapshot(),
		breakers: breaker.snapshot(),
		outbound: outboundPool().snapshot(),
		translation: {
			provider: deps.translationProvider.name,
			available: deps.translationProvider.available
		},
		ohaasa: ohaasaStatus(),
		playback: playbackSnapshot(),
		playerHub: playerHubStatus(),
		guildDataHub: guildDataHubStatus(),
		memoryTidy: memoryTidyStatus(),
		isrcEnrich: isrcEnrichStatus()
	}));

	registerOhaasaRoutes(fastify, deps);
	registerEmbedFixRoutes(fastify, deps);
	registerCacheProviderRoutes(fastify, deps);
	registerRenderRoutes(fastify);
	registerAiRoutes(fastify, deps);
	registerPlayerRoutes(fastify, deps);
	registerGuildDataRoutes(fastify);
	registerStorageProxyRoutes(fastify, { storageUrl: deps.storageUrl, storageAuthKey: deps.storageAuthKey });
	registerTtsRoutes(fastify, { ttsUrl: deps.ttsUrl });
	registerBotAdminRoutes(fastify);
	registerIncidentNoticeRoutes(fastify);
	registerPanelRoutes(fastify);
	registerGiveawayRoutes(fastify);

	await registerSocialRoutes(fastify, deps);
}
