import { INCIDENT_NOTICE_KEY } from '@sirubot/utils';
import { appendIncidentNotice, incidentNoticeSchema, isIncidentNoticeActive, type IncidentNotice } from '@sirubot/utils/incidentNotice';
import { unwrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import type { ServiceLogger } from './types.ts';

export const INCIDENT_NOTICE_CACHE_MS = 30_000;

export interface IncidentNoticeDeps {
	getRedisStore: () => { getCacheValue(key: string): Promise<string | null> } | undefined;
	signingKey: string;
	logger: ServiceLogger;
	now?: () => number;
}

export interface IncidentNoticeService {
	current(): Promise<IncidentNotice | null>;
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
