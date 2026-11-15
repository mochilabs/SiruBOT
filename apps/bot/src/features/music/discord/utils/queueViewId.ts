import { emoji } from '@sirubot/utils';
import { defineCustomId, field } from '../../../../lib/customId.ts';

/**
 * 대기열 목록(ephemeral) 컨트롤의 customId.
 * 화면 상태(주인·현재 페이지·선택한 곡)를 플레이어가 아니라 customId에 실어 보내서, 같은 길드의 사용자끼리 서로 영향을 주지 않아요.
 *
 * 형식: `queue:v1:{action}:{ownerId}:{page}[:{token}]` (Discord customId 한도 100자)
 * - page: 이동할 페이지(`page`) 또는 현재 보고 있는 페이지(그 외)
 * - token: `jump`/`rm`에만 붙는 곡 선택값(`queueSelectionValue`), 선택 전이면 `-`
 * - ind: 비활성 페이지 표시 버튼 — 클릭되지 않지만 customId는 필요해요.
 */
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
/** 이전/다음 페이지·선택한 곡 재생·선택한 곡 제거 버튼이 실어 보내는 상태 */
export type QueueButtonView = Extract<QueueViewDecoded, { action: 'page' | 'jump' | 'rm' }>;
/** 곡 선택 셀렉트 메뉴가 실어 보내는 상태 */
export type QueueSelectView = Extract<QueueViewDecoded, { action: 'sel' }>;

/** 비활성 페이지 표시 버튼 — 클릭되지 않지만 customId는 필요해요. */
export const QUEUE_VIEW_INDICATOR_ID = queueViewId.encode('ind');

export const QUEUE_VIEW_MESSAGES = {
	notOwner: `${emoji('error')} 명령어를 실행한 사람만 사용할 수 있어요.`,
	noSelection: `${emoji('error')} 먼저 목록에서 곡을 선택해 주세요.`
} as const;

/** 대기열 목록 버튼의 customId를 해석해요. 이 형식이 아니거나 페이지 표시 버튼·셀렉트 ID면 null이에요. */
export function decodeQueueButtonId(customId: string): QueueButtonView | null {
	const decoded = queueViewId.decode(customId);
	return decoded && (decoded.action === 'page' || decoded.action === 'jump' || decoded.action === 'rm') ? decoded : null;
}

/** 대기열 곡 선택 셀렉트 메뉴의 customId를 해석해요. */
export function decodeQueueSelectId(customId: string): QueueSelectView | null {
	const decoded = queueViewId.decode(customId);
	return decoded && decoded.action === 'sel' ? decoded : null;
}

/** 목록이 줄거나 늘어도 유효한 페이지로 맞춰요. */
export function clampQueuePage(page: number, totalPages: number): number {
	return Math.max(1, Math.min(page, Math.max(1, totalPages)));
}
