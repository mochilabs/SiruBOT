/**
 * 장애 공지 읽기 (P-14) — 운영자가 대시보드에서 올린 공지를 Redis 키에서 읽어 오류 화면·재생 실패 알림에 덧붙여요.
 * 봇은 읽기만 해요. 쓰기·만료(TTL)는 data-api가 맡아요. 키는 30초 동안만 캐시해서 오류가 몰릴 때도 Redis를 두드리지 않아요.
 */
import { INCIDENT_NOTICE_KEY } from '@sirubot/utils';
import { appendIncidentNotice, incidentNoticeSchema, isIncidentNoticeActive, type IncidentNotice } from '@sirubot/utils/incidentNotice';
import { unwrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import type { ServiceLogger } from './types.ts';

/** 공지 캐시 유지 시간 */
export const INCIDENT_NOTICE_CACHE_MS = 30_000;

export interface IncidentNoticeDeps {
	/** setupRedis 뒤에야 생겨서 호출 시점에 읽어요 */
	getRedisStore: () => { getCacheValue(key: string): Promise<string | null> } | undefined;
	/** Redis 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY. 비어 있으면 서명 없는 구버전 모드(개발용). */
	signingKey: string;
	logger: ServiceLogger;
	now?: () => number;
}

export interface IncidentNoticeService {
	/** 지금 유효한 공지. 없거나 읽지 못하면 null이에요 (오류 화면을 막지 않아요). */
	current(): Promise<IncidentNotice | null>;
	/** 안내 문구 끝에 공지를 한 줄 덧붙여요. 공지가 없으면 원문 그대로예요. */
	appendTo(message: string): Promise<string>;
}

export function createIncidentNoticeService(deps: IncidentNoticeDeps): IncidentNoticeService {
	const now = deps.now ?? Date.now;
	let cached: { notice: IncidentNotice | null; fetchedAt: number } | null = null;
	let inFlight: Promise<IncidentNotice | null> | null = null;

	async function load(): Promise<IncidentNotice | null> {
		const raw = await deps.getRedisStore()?.getCacheValue(INCIDENT_NOTICE_KEY);
		if (!raw) return null;
		const body = unwrapRedisMessage(deps.signingKey, raw);
		if (body === null) {
			deps.logger.warn('장애 공지 서명 검증에 실패했어요. 무시해요.');
			return null;
		}
		try {
			const parsed = incidentNoticeSchema.safeParse(JSON.parse(body));
			if (!parsed.success) {
				deps.logger.warn('장애 공지 형식이 올바르지 않아요. 무시해요.');
				return null;
			}
			return parsed.data;
		} catch {
			deps.logger.warn('장애 공지를 읽지 못했어요. 무시해요.');
			return null;
		}
	}

	async function current(): Promise<IncidentNotice | null> {
		const at = now();
		if (cached && at - cached.fetchedAt < INCIDENT_NOTICE_CACHE_MS) {
			return cached.notice && isIncidentNoticeActive(cached.notice, at) ? cached.notice : null;
		}
		inFlight ??= load()
			.catch((error: unknown) => {
				deps.logger.warn(`장애 공지 조회 실패: ${String(error)}`);
				return null;
			})
			.then((notice) => {
				cached = { notice, fetchedAt: now() };
				return notice;
			})
			.finally(() => {
				inFlight = null;
			});
		const notice = await inFlight;
		return notice && isIncidentNoticeActive(notice, now()) ? notice : null;
	}

	return {
		current,
		async appendTo(message) {
			return appendIncidentNotice(message, await current(), now());
		}
	};
}
