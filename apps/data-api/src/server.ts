import Fastify from 'fastify';
import type { Env } from './config/env.ts';
import auth from './plugins/auth.ts';
import { sharedCache } from './utils/cache.ts';
import { getLogger } from './utils/logger.ts';
import { OpenAICompatTranslationProvider } from './providers/translate.ts';
import { registerRoutes } from './routes/index.ts';
import { ensureKoreanFont } from './renderers/canvasUtils.ts';
import { startOhaasaScheduler } from './services/ohaasaScheduler.ts';
import { connectDb, disconnectDb, getDb } from './services/db.ts';
import { startMemoryTidyScheduler } from './services/memoryTidy.ts';

export async function buildServer(env: Env) {
	const logger = getLogger('server');

	await sharedCache.connect(env.REDIS_URL);

	// 이미지 렌더 폰트는 부팅 시 1회 로드 — 첫 카드 요청이 폰트 로드에 막히지 않아요.
	// (렌더러의 ensureKoreanFont() 호출은 안전망으로 남아 있어요)
	await ensureKoreanFont();

	const translationProvider = new OpenAICompatTranslationProvider(
		env.OPENAI_COMPATIBLE_API_URL.replace(/\/+$/, ''),
		(env.OPENAI_API_KEY ?? '').trim(),
		env.TRANSLATION_MODEL
	);
	if (!translationProvider.available) {
		logger.warn('Translation provider not configured, serving raw horoscopes (translated:false)');
	}

	const fastify = Fastify({
		logger: false,
		genReqId: () => crypto.randomUUID()
	});
	fastify.addHook('onSend', async (request, reply) => {
		reply.header('x-request-id', request.id);
	});

	// register()는 캡슐화 컨텍스트를 만들어 루트 레벨 라우트에 훅이 안 붙어요.
	// shardmanager와 동일하게 플러그인을 직접 호출해요.
	await auth(fastify);
	await registerRoutes(fastify, { translationProvider });

	const stopScheduler = startOhaasaScheduler(env, translationProvider);

	// 메모리 정리(nightly pass) — 봇 샤드 각각이 돌리던 것을 게이트웨이로 이전.
	// DB+프로바이더가 있을 때만 활성화돼요.
	await connectDb(env.DATABASE_URL);
	const stopTidy = startMemoryTidyScheduler(getDb(), translationProvider, {
		enabled: env.MEMORY_TIDY_ENABLED,
		at: env.MEMORY_TIDY_AT,
		batchSize: env.MEMORY_TIDY_BATCH_SIZE
	});

	const close = async () => {
		stopScheduler();
		stopTidy();
		await sharedCache.disconnect();
		await disconnectDb();
		await fastify.close();
	};

	return { fastify, close };
}
