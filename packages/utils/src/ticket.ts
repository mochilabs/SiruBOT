import { z } from 'zod';

const snowflake = z.string().regex(/^\d{17,20}$/, '올바른 ID 형식이 아니에요.');
const nullableSnowflake = snowflake.nullable();

export const TICKET_CUSTOM_ID_PREFIX = 'ticket:';
export const TICKET_OPEN_CUSTOM_ID = 'ticket:open';
export const TICKET_CLOSE_CUSTOM_ID = 'ticket:close';
export const TICKET_CLAIM_CUSTOM_ID = 'ticket:claim';
export const TICKET_CONFIRM_CLOSE_CUSTOM_ID = 'ticket:confirm_close';

export const ticketStatusSchema = z.enum(['open', 'closed']);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

const ticketConfigBaseSchema = z.object({
	enabled: z.boolean(),
	categoryId: nullableSnowflake,
	supportRoleIds: z.array(snowflake, '역할 ID 목록이 올바르지 않아요.').max(10, '담당자 역할은 최대 10개까지 설정할 수 있어요.'),
	logChannelId: nullableSnowflake,
	maxOpenPerUser: z.number().int('티켓 수는 정수여야 해요.').min(1, '최소 1개 이상이어야 해요.').max(5, '동시 티켓은 최대 5개까지예요.'),
	panelTitle: z.string().min(1, '패널 제목을 입력해 주세요.').max(100, '제목은 100자 이하여야 해요.'),
	panelDescription: z.string().min(1, '패널 안내문을 입력해 주세요.').max(1000, '안내문은 1000자 이하여야 해요.'),
	panelChannelId: nullableSnowflake,
	panelMessageId: nullableSnowflake
});

export const ticketConfigSchema = z.object({
	enabled: z.boolean().default(false),
	categoryId: nullableSnowflake.optional().default(null),
	supportRoleIds: z.array(snowflake, '역할 ID 목록이 올바르지 않아요.').max(10, '담당자 역할은 최대 10개까지 설정할 수 있어요.').default([]),
	logChannelId: nullableSnowflake.optional().default(null),
	maxOpenPerUser: z.number().int('티켓 수는 정수여야 해요.').min(1, '최소 1개 이상이어야 해요.').max(5, '동시 티켓은 최대 5개까지예요.').default(1),
	panelTitle: z.string().min(1, '패널 제목을 입력해 주세요.').max(100, '제목은 100자 이하여야 해요.').default('고객지원 티켓'),
	panelDescription: z
		.string()
		.min(1, '패널 안내문을 입력해 주세요.')
		.max(1000, '안내문은 1000자 이하여야 해요.')
		.default('아래 버튼을 눌러 담당자와 1:1 비공개 상담 채널을 개설해요.'),
	panelChannelId: nullableSnowflake.optional().default(null),
	panelMessageId: nullableSnowflake.optional().default(null)
});

export type TicketConfig = z.infer<typeof ticketConfigSchema>;

export const ticketConfigPatchSchema = ticketConfigBaseSchema.partial();
export type TicketConfigPatch = z.infer<typeof ticketConfigPatchSchema>;

export const TICKET_CONFIG_DEFAULTS: TicketConfig = {
	enabled: false,
	categoryId: null,
	supportRoleIds: [],
	logChannelId: null,
	maxOpenPerUser: 1,
	panelTitle: '고객지원 티켓',
	panelDescription: '아래 버튼을 눌러 담당자와 1:1 비공개 상담 채널을 개설해요.',
	panelChannelId: null,
	panelMessageId: null
};

export function formatTicketChannelName(ticketNumber: number): string {
	return `ticket-${String(ticketNumber).padStart(4, '0')}`;
}
