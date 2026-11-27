import { emoji } from '@sirubot/utils';
import { defineCustomId, field } from '../../../../lib/customId.ts';

export const queueViewId = defineCustomId({
	namespace: 'queue',
	version: 1,
	actions: {
		page: { ownerId: field.snowflake(), page: field.uint({ maxDigits: 7 }) },
		sel: { ownerId: field.snowflake(), page: field.uint({ maxDigits: 7 }) },
		jump: { ownerId: field.snowflake(), page: field.uint({ maxDigits: 7 }), token: field.nullable(field.token()) },
		rm: { ownerId: field.snowflake(), page: field.uint({ maxDigits: 7 }), token: field.nullable(field.token()) },
		ind: {}
	}
});

type QueueViewDecoded = NonNullable<ReturnType<typeof queueViewId.decode>>;
export type QueueButtonView = Extract<QueueViewDecoded, { action: 'page' | 'jump' | 'rm' }>;
export type QueueSelectView = Extract<QueueViewDecoded, { action: 'sel' }>;

export const QUEUE_VIEW_INDICATOR_ID = queueViewId.encode('ind');

export const QUEUE_VIEW_MESSAGES = {
	notOwner: `${emoji('error')} 명령어를 실행한 사람만 사용할 수 있어요.`,
	noSelection: `${emoji('error')} 먼저 목록에서 곡을 선택해 주세요.`
} as const;

export function decodeQueueButtonId(customId: string): QueueButtonView | null {
	const decoded = queueViewId.decode(customId);
	return decoded && (decoded.action === 'page' || decoded.action === 'jump' || decoded.action === 'rm') ? decoded : null;
}

export function decodeQueueSelectId(customId: string): QueueSelectView | null {
	const decoded = queueViewId.decode(customId);
	return decoded && decoded.action === 'sel' ? decoded : null;
}

export function clampQueuePage(page: number, totalPages: number): number {
	return Math.max(1, Math.min(page, Math.max(1, totalPages)));
}
