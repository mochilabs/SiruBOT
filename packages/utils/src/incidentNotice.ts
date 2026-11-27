import { z } from 'zod';

export const INCIDENT_NOTICE_MAX_LENGTH = 200;

export const INCIDENT_NOTICE_MAX_MINUTES = 7 * 24 * 60;

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

export const incidentNoticeSchema = z.object({
	message: z.string().min(1).max(INCIDENT_NOTICE_MAX_LENGTH),
	createdAt: z.number().int().nonnegative(),
	expiresAt: z.number().int().nonnegative()
});
export type IncidentNotice = z.infer<typeof incidentNoticeSchema>;

export function buildIncidentNotice(input: IncidentNoticeInput, now: number): IncidentNotice {
	return { message: input.message, createdAt: now, expiresAt: now + input.expiresInMinutes * 60_000 };
}

export function isIncidentNoticeActive(notice: IncidentNotice, now: number): boolean {
	return notice.expiresAt > now;
}

export function incidentNoticeTtlSeconds(notice: IncidentNotice, now: number): number {
	return Math.ceil((notice.expiresAt - now) / 1000);
}

// Neutralize @ mentions with a zero-width space.
export function appendIncidentNotice(message: string, notice: IncidentNotice | null, now: number): string {
	if (!notice || !isIncidentNoticeActive(notice, now)) return message;
	const line = notice.message.replace(/\s+/g, ' ').trim().replaceAll('@', '@​');
	return `${message}\n-# 📢 공지: ${line}`;
}
