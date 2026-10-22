import { resolveRedisSigningKey } from '@sirubot/utils/redisEnvelope';
import { initSentry, registerProcessErrorHandlers } from '@sirubot/utils/sentry';
import { validateEnv } from './config/env.ts';
import { buildServer } from './server.ts';
import { connectDb, disconnectDb } from './services/db.ts';
import { NotifierRedis } from './services/redis.ts';
import { SocialDispatcher } from './services/dispatcher.ts';
import { ChzzkPoller } from './services/chzzkPoller.ts';
import { YouTubeScheduler } from './services/youtubeScheduler.ts';
import { TwitchApiClient } from './services/twitchApi.ts';
import { TwitchScheduler } from './services/twitchScheduler.ts';
import { SocialWebhookHub } from './services/webhookHub.ts';
import { getLogger } from './utils/logger.ts';

const logger = getLogger('index');

// data-api·shardmanager와 같은 패턴 — SENTRY_DSN이 없으면 no-op이에요.
initSentry({ service: 'notifier' });
registerProcessErrorHandlers(logger);

async function main(): Promise<void> {
	const env = validateEnv();

	// 서비스 의존성을 먼저 뭉쳐요 — 공개 콜백 라우트가 dispatcher를 필요로 해요.
	const db = await connectDb(env.DATABASE_URL);
	const redis = new NotifierRedis();
	await redis.connect(env.REDIS_URL);

	const dispatcher = new SocialDispatcher({ getDb: () => db, redis });
	const hub = new SocialWebhookHub(redis, resolveRedisSigningKey(process.env), env.REDIS_URL);
	// 트위치 클라이언트는 login 해석 라우트가 쓸 수 있게 푸시 활성과 무관하게 만들어요.
	const twitchClient =
		env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET
			? new TwitchApiClient({ clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET })
			: null;
	const { fastify } = await buildServer(env, { dispatcher, getDb: () => db, hub, twitchClient, redis });

	const poller = new ChzzkPoller({ redis, getDb: () => db, dispatcher, fetchFn: fetch });
	if (env.chzzkPollingEnabled && db) {
		poller.start();
	} else if (!env.chzzkPollingEnabled) {
		logger.warn('CHZZK_POLLING_ENABLED=false — 치지직 폴러를 꺼요.');
	} else {
		logger.warn('DB 연결이 없어 치지직 폴러를 켤 수 없어요.');
	}

	const pushEnabled = Boolean(env.notifierPublicUrl && env.YOUTUBE_HUB_SECRET);
	const scheduler = new YouTubeScheduler({
		redis,
		getDb: () => db,
		dispatcher,
		callbackUrl: env.notifierPublicUrl ? `${env.notifierPublicUrl}/pubsub/youtube` : null,
		hubSecret: env.YOUTUBE_HUB_SECRET ?? null,
		fetchFn: fetch
	});
	if (db) {
		scheduler.start();
		if (!pushEnabled) {
			logger.info('NOTIFIER_PUBLIC_URL/YOUTUBE_HUB_SECRET가 세트가 아니에요 — 유튜브 WebSub 푸시 없이 RSS 감사만 동작해요.');
		}
	} else {
		logger.warn('DB 연결이 없어 유튜브 스케줄러를 켤 수 없어요.');
	}

	let twitchScheduler: TwitchScheduler | null = null;
	const twitchEnabled = Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET && env.TWITCH_EVENTSUB_SECRET && env.notifierPublicUrl);
	if (twitchEnabled && db) {
		twitchScheduler = new TwitchScheduler({
			redis,
			getDb: () => db,
			client: twitchClient!,
			callbackUrl: `${env.notifierPublicUrl}/eventsub/twitch`,
			eventSubSecret: env.TWITCH_EVENTSUB_SECRET!
		});
		twitchScheduler.start();
	} else if (!db) {
		logger.warn('DB 연결이 없어 트위치 스케줄러를 켤 수 없어요.');
	} else {
		logger.info('TWITCH_CLIENT_ID/SECRET/EVENTSUB_SECRET 또는 NOTIFIER_PUBLIC_URL이 세트가 아니에요 — 트위치 EventSub 푸시가 꺼져요.');
	}

	let closing = false;
	const close = async () => {
		if (closing) return;
		closing = true;
		poller.stop();
		scheduler.stop();
		twitchScheduler?.stop();
		hub.stop();
		await disconnectDb();
		await redis.disconnect();
		await fastify.close();
	};
	process.on('SIGINT', () => void close().then(() => process.exit(0)));
	process.on('SIGTERM', () => void close().then(() => process.exit(0)));

	await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
	logger.info(`notifier가 ${env.PORT} 포트에서 들었어요.`);
}

void main().catch((error) => {
	logger.error('notifier 기동에 실패했어요:', error);
	process.exit(1);
});
