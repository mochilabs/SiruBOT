import { emoji } from '@sirubot/utils';

/**
 * 대기열 목록(ephemeral) 컨트롤의 customId 인코딩.
 * 화면 상태(주인·현재 페이지·선택한 곡)를 플레이어가 아니라 customId에 실어 보내서, 같은 길드의 사용자끼리 서로 영향을 주지 않아요.
 *
 * 형식: `queue:v1:{action}:{ownerId}:{page}[:{token}]` (Discord customId 한도 100자)
 * - page: 이동할 페이지(`page`) 또는 현재 보고 있는 페이지(그 외)
 * - token: `jump`/`rm`에만 붙는 곡 선택값(`queueSelectionValue`), 선택 전이면 `-`
 */
export const QUEUE_VIEW_PREFIX = 'queue:v1:';
/** 비활성 페이지 표시 버튼 — 클릭되지 않지만 customId는 필요해요. */
export const QUEUE_VIEW_INDICATOR_ID = `${QUEUE_VIEW_PREFIX}ind`;

export type QueueViewAction = 'page' | 'sel' | 'jump' | 'rm';

export type QueueViewId = {
	action: QueueViewAction;
	ownerId: string;
	page: number;
	/** 곡 선택값. `jump`/`rm`에서 선택 전이면 null, 그 외 액션에서는 항상 null. */
	token: string | null;
};

export const QUEUE_VIEW_MESSAGES = {
	notOwner: `${emoji('error')} 명령어를 실행한 사람만 사용할 수 있어요.`,
	expired: `${emoji('info')} 예전 대기열 화면이라 사용할 수 없어요. \`/대기열 목록\`을 다시 열어 주세요.`,
	noSelection: `${emoji('error')} 먼저 목록에서 곡을 선택해 주세요.`
} as const;

const NO_TOKEN = '-';
const ACTIONS: ReadonlySet<string> = new Set<QueueViewAction>(['page', 'sel', 'jump', 'rm']);
const OWNER_PATTERN = /^\d{1,20}$/;
const PAGE_PATTERN = /^\d{1,7}$/;
const TOKEN_PATTERN = /^[0-9a-f.]{1,40}$/;

export function encodeQueueViewId({ action, ownerId, page, token = null }: Omit<QueueViewId, 'token'> & { token?: string | null }): string {
	const base = `${QUEUE_VIEW_PREFIX}${action}:${ownerId}:${Math.max(0, Math.trunc(page))}`;
	return action === 'jump' || action === 'rm' ? `${base}:${token ?? NO_TOKEN}` : base;
}

/** customId를 해석해요. 형식이 맞지 않거나 예전 형식이면 null이에요. */
export function parseQueueViewId(customId: string): QueueViewId | null {
	if (!customId.startsWith(QUEUE_VIEW_PREFIX)) return null;
	const [action, ownerId, page, token, ...rest] = customId.slice(QUEUE_VIEW_PREFIX.length).split(':');
	if (rest.length > 0 || !action || !ACTIONS.has(action) || !ownerId || !OWNER_PATTERN.test(ownerId) || !page || !PAGE_PATTERN.test(page)) {
		return null;
	}
	const hasToken = action === 'jump' || action === 'rm';
	if (hasToken !== (token !== undefined)) return null;
	if (token !== undefined && token !== NO_TOKEN && !TOKEN_PATTERN.test(token)) return null;
	return {
		action: action as QueueViewAction,
		ownerId,
		page: Number(page),
		token: token === undefined || token === NO_TOKEN ? null : token
	};
}

/** 대기열 목록 버튼의 customId인지(예전 형식 포함) — 핸들러의 parse에서 써요. */
export function isQueueViewCustomId(customId: string): boolean {
	return customId.startsWith('queue:') && customId !== QUEUE_VIEW_INDICATOR_ID;
}

/** 목록이 줄거나 늘어도 유효한 페이지로 맞춰요. */
export function clampQueuePage(page: number, totalPages: number): number {
	return Math.max(1, Math.min(page, Math.max(1, totalPages)));
}
