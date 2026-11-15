import { MessageFlags } from 'discord.js';
import type { Ticket } from '@sirubot/prisma';
import { describe, expect, it } from 'vitest';
import { ticketMessages } from './ticketMessages.ts';

describe('ticketMessages (Discord 렌더링)', () => {
	it('notice는 텍스트 한 블록을 Components V2 메시지로 만들어요', () => {
		const payload = ticketMessages.notice('안내예요');
		expect(payload.flags).toEqual([MessageFlags.IsComponentsV2]);
		expect(payload.components).toHaveLength(1);
		expect(JSON.stringify(payload.components![0])).toContain('안내예요');
	});

	it('welcome은 신청자 멘션과 티켓 번호가 담긴 환영 메시지를 만들어요', () => {
		const ticket = { id: 't1', ownerId: '42', ticketNumber: 7, claimedById: null } as Ticket;
		const json = JSON.stringify(ticketMessages.welcome(ticket));
		expect(json).toContain('<@42> 님의 티켓이 생성되었어요.');
		expect(json).toContain('#0007');
		expect(json).toContain('미배정');
	});
});
