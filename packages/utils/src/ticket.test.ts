import { describe, expect, it } from 'vitest';
import { formatTicketChannelName, ticketConfigPatchSchema, ticketConfigSchema } from './ticket.ts';

describe('ticketConfigSchema', () => {
	it('기본값으로 올바르게 파싱된다', () => {
		const parsed = ticketConfigSchema.parse({});
		expect(parsed.enabled).toBe(false);
		expect(parsed.categoryId).toBeNull();
		expect(parsed.supportRoleIds).toEqual([]);
		expect(parsed.logChannelId).toBeNull();
		expect(parsed.maxOpenPerUser).toBe(1);
		expect(parsed.panelTitle).toBe('고객지원 티켓');
		expect(parsed.panelDescription).toBe('아래 버튼을 눌러 담당자와 1:1 비공개 상담 채널을 개설해요.');
	});

	it('유효한 Snowflake ID와 역할 목록을 수용한다', () => {
		const parsed = ticketConfigSchema.parse({
			enabled: true,
			categoryId: '123456789012345678',
			supportRoleIds: ['123456789012345678', '234567890123456789'],
			logChannelId: '345678901234567890',
			maxOpenPerUser: 3
		});
		expect(parsed.enabled).toBe(true);
		expect(parsed.categoryId).toBe('123456789012345678');
		expect(parsed.supportRoleIds).toHaveLength(2);
		expect(parsed.maxOpenPerUser).toBe(3);
	});

	it('동시 티켓 상한(5)을 초과하면 검증에 실패한다', () => {
		const result = ticketConfigSchema.safeParse({
			maxOpenPerUser: 6
		});
		expect(result.success).toBe(false);
	});

	it('부분 수정(PATCH) 스키마가 정상 동작한다', () => {
		const patch = ticketConfigPatchSchema.parse({
			enabled: true,
			panelTitle: '새로운 문의 창구'
		});
		expect(patch.enabled).toBe(true);
		expect(patch.panelTitle).toBe('새로운 문의 창구');
		expect(patch.categoryId).toBeUndefined();
	});
});

describe('formatTicketChannelName', () => {
	it('티켓 번호를 4자리 패딩 채널 이름으로 포맷한다', () => {
		expect(formatTicketChannelName(1)).toBe('ticket-0001');
		expect(formatTicketChannelName(42)).toBe('ticket-0042');
		expect(formatTicketChannelName(1234)).toBe('ticket-1234');
	});
});
