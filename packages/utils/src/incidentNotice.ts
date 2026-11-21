import { z } from 'zod';

/**
 * 장애 공지 공용 계약 — 대시보드(`/admin` 입력), data-api(Redis 기록), 봇(오류 화면·재생 실패 알림에 덧붙임)이 함께 써요.
 * Redis 키 이름은 `redisChannels.ts`의 `INCIDENT_NOTICE_KEY`예요. 이 모듈은 클라이언트 번들에도 들어가므로 서브패스로만 import해요.
 */

/** 공지 본문 최대 글자 수 */
export const INCIDENT_NOTICE_MAX_LENGTH = 200;

/** 만료까지 최대 시간(분) — 7일. 만료 시간은 필수예요 (잊고 둔 공지가 영원히 남지 않게). */
export const INCIDENT_NOTICE_MAX_MINUTES = 7 * 24 * 60;

/** 운영자 입력 — 본문은 한 줄이고, 만료는 "지금부터 몇 분 뒤"로 받아요 (시계 차이에 안 흔들려요) */
export const incidentNoticeInputSchema = z.object({
	message: z
		.string()
		.trim()
		.min(1, '공지 내용을 입력해 주세요.')
		.max(INCIDENT_NOTICE_MAX_LENGTH, `공지는 ${INCIDENT_NOTICE_MAX_LENGTH}자까지 쓸 수 있어요.`)
		.refine((value) => !/[\r\n]/.test(value), '공지는 한 줄로 써 주세요.'),
	expiresInMinutes: z
		.number('만료 시간을 골라 주세요.')
		.int('만료 시간은 분 단위 정수예요.')
		.min(1, '만료 시간은 1분 이상이어야 해요.')
		.max(INCIDENT_NOTICE_MAX_MINUTES, '만료 시간은 최대 7일까지예요.')
});
export type IncidentNoticeInput = z.infer<typeof incidentNoticeInputSchema>;

/** Redis에 저장되는 공지 (시각은 epoch ms) */
export const incidentNoticeSchema = z.object({
	message: z.string().min(1).max(INCIDENT_NOTICE_MAX_LENGTH),
	createdAt: z.number().int().nonnegative(),
	expiresAt: z.number().int().nonnegative()
});
export type IncidentNotice = z.infer<typeof incidentNoticeSchema>;

/** 입력을 저장 형태로 바꿔요 */
export function buildIncidentNotice(input: IncidentNoticeInput, now: number): IncidentNotice {
	return { message: input.message, createdAt: now, expiresAt: now + input.expiresInMinutes * 60_000 };
}

/** 만료되지 않았는지 — Redis TTL이 지우기 전의 짧은 틈과 캐시된 값을 위해 시각도 직접 봐요 */
export function isIncidentNoticeActive(notice: IncidentNotice, now: number): boolean {
	return notice.expiresAt > now;
}

/** 저장할 때 붙일 TTL(초). 이미 만료됐으면 0 이하예요. */
export function incidentNoticeTtlSeconds(notice: IncidentNotice, now: number): number {
	return Math.ceil((notice.expiresAt - now) / 1000);
}

/**
 * 안내 문구 끝에 공지를 한 줄로 덧붙여요. 공지가 없거나 만료됐으면 원문 그대로예요.
 * 공지는 운영자가 쓰지만 `@everyone`·`@here`·멘션이 실제로 울리지 않게 `@` 뒤에 보이지 않는 글자를 넣어요.
 */
export function appendIncidentNotice(message: string, notice: IncidentNotice | null, now: number): string {
	if (!notice || !isIncidentNoticeActive(notice, now)) return message;
	const line = notice.message.replace(/\s+/g, ' ').trim().replaceAll('@', '@​');
	return `${message}\n-# 📢 공지: ${line}`;
}
