import { describe, expect, it } from 'vitest';
import {
	INCIDENT_NOTICE_MAX_LENGTH,
	INCIDENT_NOTICE_MAX_MINUTES,
	appendIncidentNotice,
	buildIncidentNotice,
	incidentNoticeInputSchema,
	incidentNoticeTtlSeconds,
	isIncidentNoticeActive
} from './incidentNotice.ts';

const NOW = 1_700_000_000_000;

describe('incidentNoticeInputSchema', () => {
	it('공지와 만료 시간이 모두 있으면 통과해요', () => {
		const parsed = incidentNoticeInputSchema.parse({ message: '  YouTube 재생이 불안정해요.  ', expiresInMinutes: 60 });
		expect(parsed.message).toBe('YouTube 재생이 불안정해요.');
	});

	it('만료 시간이 없으면 거부해요', () => {
		expect(incidentNoticeInputSchema.safeParse({ message: '공지' }).success).toBe(false);
	});

	it.each([0, -5, 1.5, INCIDENT_NOTICE_MAX_MINUTES + 1])('만료 시간 %s분은 거부해요', (minutes) => {
		expect(incidentNoticeInputSchema.safeParse({ message: '공지', expiresInMinutes: minutes }).success).toBe(false);
	});

	it('만료 시간 7일은 통과해요', () => {
		expect(incidentNoticeInputSchema.safeParse({ message: '공지', expiresInMinutes: INCIDENT_NOTICE_MAX_MINUTES }).success).toBe(true);
	});

	it('200자는 통과하고 201자는 거부해요', () => {
		expect(incidentNoticeInputSchema.safeParse({ message: 'a'.repeat(INCIDENT_NOTICE_MAX_LENGTH), expiresInMinutes: 10 }).success).toBe(true);
		expect(incidentNoticeInputSchema.safeParse({ message: 'a'.repeat(INCIDENT_NOTICE_MAX_LENGTH + 1), expiresInMinutes: 10 }).success).toBe(
			false
		);
	});

	it('빈 공지와 줄바꿈이 든 공지는 거부해요', () => {
		expect(incidentNoticeInputSchema.safeParse({ message: '   ', expiresInMinutes: 10 }).success).toBe(false);
		expect(incidentNoticeInputSchema.safeParse({ message: '한 줄\n두 줄', expiresInMinutes: 10 }).success).toBe(false);
	});
});

describe('공지 만료', () => {
	const notice = buildIncidentNotice({ message: '점검 중', expiresInMinutes: 30 }, NOW);

	it('만료 시각과 TTL을 계산해요', () => {
		expect(notice.expiresAt).toBe(NOW + 30 * 60_000);
		expect(incidentNoticeTtlSeconds(notice, NOW)).toBe(1800);
	});

	it('만료 시각이 지나면 활성이 아니에요', () => {
		expect(isIncidentNoticeActive(notice, NOW + 29 * 60_000)).toBe(true);
		expect(isIncidentNoticeActive(notice, notice.expiresAt)).toBe(false);
	});
});

describe('appendIncidentNotice', () => {
	const notice = buildIncidentNotice({ message: '재생이 불안정해요', expiresInMinutes: 30 }, NOW);

	it('공지가 있으면 한 줄을 덧붙여요', () => {
		expect(appendIncidentNotice('오류예요.', notice, NOW)).toBe('오류예요.\n-# 📢 공지: 재생이 불안정해요');
	});

	it('공지가 없거나 만료됐으면 원문 그대로예요', () => {
		expect(appendIncidentNotice('오류예요.', null, NOW)).toBe('오류예요.');
		expect(appendIncidentNotice('오류예요.', notice, notice.expiresAt)).toBe('오류예요.');
	});

	it('멘션이 울리지 않게 @를 무력화해요', () => {
		const mention = buildIncidentNotice({ message: '@everyone 확인', expiresInMinutes: 5 }, NOW);
		expect(appendIncidentNotice('x', mention, NOW)).not.toContain('@everyone');
	});
});
