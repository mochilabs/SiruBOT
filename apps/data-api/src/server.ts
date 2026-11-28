import Fastify from 'fastify';
import { registerAppErrorHandler } from '@sirubot/app-kit';
import { captureSentryException } from '@sirubot/utils/sentry';
import type { Env } from './config/env.ts';
import auth from './plugins/auth.ts';
import { sharedCache } from './utils/cache.ts';
import { getLogger } from './utils/logger.ts';
import { OpenAICompatTranslationProvider } from './providers/translate.ts';
import { registerRoutes } from './routes/index.ts';
import { getCardRenderer } from './renderers/shared/takumiKit.tsx';
import { startOhaasaScheduler } from './services/ohaasaScheduler.ts';
import { connectDb, disconnectDb, getDb } from './services/db.ts';
import { startMemoryTidyScheduler } from './services/memoryTidy.ts';
import { createIsrcProviders, IsrcEnricher, startIsrcEnrichScheduler } from './services/isrcEnricher.ts';
import { startPlayerHub, stopPlayerHub } from './services/playerHub.ts';
import { startBotProfileHub, stopBotProfileHub } from './services/botProfileHub.ts';
import { startMemberGreetingHub, stopMemberGreetingHub } from './services/memberGreetingHub.ts';
import { startGuildDataHub, stopGuildDataHub } from './services/guildDataHub.ts';
import { startPlayerWebHub, stopPlayerWebHub } from './services/playerWebHub.ts';
import { startJtcSetupHub, stopJtcSetupHub } from './services/jtcSetupHub.ts';
import { startBotAdminHub, stopBotAdminHub } from './services/botAdminHub.ts';
import { startGiveawayHub, stopGiveawayHub } from './services/giveawayHub.ts';
import { startPanelHub, stopPanelHub } from './services/panelHub.ts';
import { configureOutboundPool } from './utils/proxyPool.ts';

const HUBS: { start: (redisUrl: string | undefined) => Promise<void>; stop: () => Promise<void> }[] = [
	{ start: startPlayerHub, stop: stopPlayerHub },
	{ start: startBotProfileHub, stop: stopBotProfileHub },
	{ start: startMemberGreetingHub, stop: stopMemberGreetingHub },
	{ start: startGuildDataHub, stop: stopGuildDataHub },
	{ start: startPlayerWebHub, stop: stopPlayerWebHub },
	{ start: startJtcSetupHub, stop: stopJtcSetupHub },
	{ start: startBotAdminHub, stop: stopBotAdminHub },
	{ start: startPanelHub, stop: stopPanelHub },
	{ start: startGiveawayHub, stop: stopGiveawayHub }
];

export async function buildServer(env: Env) {
	const logger = getLogger('server');

	await sharedCache.connect(env.REDIS_URL);
	configureOutboundPool(env.OUTBOUND_PROXY_URLS);
	for (const hub of HUBS) await hub.start(env.REDIS_URL);

	await getCardRenderer();

	const translationProvider = new OpenAICompatTranslationProvider(
		env.OPENAI_COMPATIBLE_API_URL.replace(/\/+$/, ''),
		(env.OPENAI_API_KEY ?? '').trim(),
		env.TRANSLATION_MODEL
	);
	if (!translationProvider.available) {
		logger.warn('Translation provider not configured, serving raw horoscopes (translated:false)');
	}
	const draftProvider = new OpenAICompatTranslationProvider(
		env.OPENAI_COMPATIBLE_API_URL.replace(/\/+$/, ''),
		(env.OPENAI_API_KEY ?? '').trim(),
		env.CUSTOM_COMMAND_DRAFT_MODEL ?? env.TRANSLATION_MODEL
	);

	const fastify = Fastify({
		logger: false,
		genReqId: () => crypto.randomUUID()
	});
	fastify.addHook('onSend', async (request, reply) => {
		reply.header('x-request-id', request.id);
	});
	registerAppErrorHandler(fastify, { logger, onServerError: captureSentryException });

	// register() encapsulates hooks away from root routes; invoke directly like shardmanager.
	await auth(fastify, env.dataApiAuthKey);
	await registerRoutes(fastify, {
		translationProvider,
		draftProvider,
		lavalinkRestUrl: env.LAVALINK_REST_URL,
		lavalinkPassword: env.LAVALINK_PASSWORD,
		notifierUrl: env.NOTIFIER_URL,
		notifierAuthKey: env.notifierAuthKey,
		storageUrl: env.STORAGE_URL,
		storageAuthKey: env.storageAuthKey,
		ttsUrl: env.SIRU_TTS_URL
	});

	const stopScheduler = startOhaasaScheduler(env, translationProvider);

	await connectDb(env.DATABASE_URL);
	const stopTidy = startMemoryTidyScheduler(getDb(), translationProvider, {
		enabled: env.MEMORY_TIDY_ENABLED,
		at: env.MEMORY_TIDY_AT,
		batchSize: env.MEMORY_TIDY_BATCH_SIZE
	});
	const db = getDb();
	const stopIsrc = startIsrcEnrichScheduler(
		db ? new IsrcEnricher(db, createIsrcProviders({ musicBrainzUserAgent: env.MUSICBRAINZ_USER_AGENT }), env.ISRC_ENRICH_BATCH) : null,
		{ enabled: env.ISRC_ENRICH_ENABLED }
	);

	const close = async () => {
		stopScheduler();
		stopTidy();
		stopIsrc();
		for (const hub of HUBS) await hub.stop();
		await sharedCache.disconnect();
		await disconnectDb();
		await fastify.close();
	};

	return { fastify, close };
}
