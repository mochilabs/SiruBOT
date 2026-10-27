import type { FastifyInstance } from 'fastify';
import { sharedCache } from '../utils/cache.ts';
import { breaker } from '../utils/breaker.ts';
import { inflightCount } from '../utils/dedup.ts';
import { metrics } from '../utils/metrics.ts';
import type { OpenAICompatTranslationProvider } from '../providers/translate.ts';
import { ohaasaStatus } from '../services/ohaasaScheduler.ts';
import { playbackSnapshot } from '../services/playbackStore.ts';
import { memoryTidyStatus } from '../services/memoryTidy.ts';
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

export interface RouteDeps {
	translationProvider: OpenAICompatTranslationProvider;
	/** 커스텀 명령어 초안 생성용 — model만 다르고 같은 OpenAI 호환 엔드포인트를 써요 */
	draftProvider: OpenAICompatTranslationProvider;
	lavalinkRestUrl?: string;
	lavalinkPassword?: string;
	/** 소셜 알림 프록시 대상 — 미설정이면 프록시 라우트가 503으로 응답해요 */
	notifierUrl?: string;
	/** notifier 인증 키 — Authorization 헤더 원문(Bearer 없음) */
	notifierAuthKey?: string;
	/** storage base URL·키 — 비공개 오브젝트(티켓 transcript) 중계용. 미설정이면 503 */
	storageUrl?: string;
	storageAuthKey?: string;
}

/**
 * 라우트 진입점 — 헬스·스테이터스와 도메인 모듈 등록만 담당해요.
 * 각 도메인의 라우트·zod 스키마는 routes/ 내 도메인 파일(ohaasa·embed-fix·cache-providers·render·ai·player·guild-data)에,
 * 도메인 간 공용 응답 헬퍼·파라미터 스키마는 routes/common.ts에 있어요.
 */
export async function registerRoutes(fastify: FastifyInstance, deps: RouteDeps): Promise<void> {
	fastify.get('/api/health', async () => ({
		ok: true,
		service: 'data-api',
		redis: sharedCache.connected
	}));

	// 자체 모니터링 대시보드 (서드파티 0) — auth 제외 대상에 추가
	registerDashboard(fastify);

	fastify.get('/v1/status', async () => ({
		ok: true,
		redis: sharedCache.connected,
		cache: sharedCache.stats(),
		inflight: inflightCount(),
		routes: metrics.snapshot(),
		breakers: breaker.snapshot(),
		translation: {
			provider: deps.translationProvider.name,
			available: deps.translationProvider.available
		},
		ohaasa: ohaasaStatus(),
		playback: playbackSnapshot(),
		playerHub: playerHubStatus(),
		guildDataHub: guildDataHubStatus(),
		memoryTidy: memoryTidyStatus()
	}));

	registerOhaasaRoutes(fastify, deps);
	registerEmbedFixRoutes(fastify, deps);
	registerCacheProviderRoutes(fastify);
	registerRenderRoutes(fastify);
	registerAiRoutes(fastify, deps);
	registerPlayerRoutes(fastify, deps);
	registerGuildDataRoutes(fastify);
	registerStorageProxyRoutes(fastify, { storageUrl: deps.storageUrl, storageAuthKey: deps.storageAuthKey });

	// 소셜 알림 프록시 — 구독 도메인은 notifier가 단일 소유해요.
	await registerSocialRoutes(fastify, deps);
}
