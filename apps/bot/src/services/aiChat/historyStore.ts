import { container } from '@sapphire/framework';
import { estimateTokens, getContextTokenBudget } from './tokenBudget.ts';
import { contentText, type ChannelHistoryState, type ChatMessage } from './types.ts';

const HISTORY_MAX_TURNS = 150;
/** 요약기가 장시간 실패해도 기록이 무한 증식하지 않도록 하는 pending 상한 */
const SUMMARY_PENDING_MAX = 120;
/** 채널별 persist 코얼레스 창 — 유저 메시지 1건마다 전체 히스토리를 다시 쓰지 않도록 변경을 모아요 */
const PERSIST_COALESCE_MS = 500;

const channelHistories = new Map<string, ChannelHistoryState>();
/** row가 없다고 확인된 채널 — 메시지 삭제 리스너의 불필요한 DB 조회를 줄여요 */
const emptyChannelIds = new Set<string>();
/** channelId → guildId (persist 시 guildId 기록용, 대시보드 서버 단위 삭제를 위함) */
const channelGuilds = new Map<string, string>();
/** persist가 예약된 채널 (값=타이머) — 여기에 있으면 dirty */
const pendingPersists = new Map<string, ReturnType<typeof setTimeout>>();

/** historyLine 결과 캐시 — append·프롬프트 조립마다 같은 메시지를 다시 형식화하지 않아요 */
const historyLineCache = new WeakMap<ChatMessage, string>();
/** 메시지 라인의 토큰 비용 캐시 — 증분 토큰 갱신이 O(1)이 되게 해요 */
const lineTokenCache = new WeakMap<ChatMessage, number>();

function defaultHistoryState(): ChannelHistoryState {
	return { messages: [], summary: null, pending: [], tokens: 0 };
}

function getOrCreateHistory(channelId: string): ChannelHistoryState {
	let state = channelHistories.get(channelId);
	if (!state) {
		state = defaultHistoryState();
		channelHistories.set(channelId, state);
	}
	return state;
}

/** 저장된 상태를 직접 들여다봐요 — 없으면 생성하지 않고 undefined (요약기처럼 "있을 때만" 동작하는 용도) */
export function getStoredHistoryState(channelId: string): ChannelHistoryState | undefined {
	return channelHistories.get(channelId);
}

export function setChannelGuild(channelId: string, guildId: string | null | undefined): void {
	if (guildId) channelGuilds.set(channelId, guildId);
}

/** 저장된 JSON의 messages 토큰 합 — 캐시가 비어 있는 로드 시점 1회 계산이에요 */
function computeTokens(messages: ChatMessage[]): number {
	let sum = 0;
	for (const message of messages) sum += lineTokens(message);
	return sum;
}

/** 저장된 JSON을 ChannelHistoryState로 해석해요 (옛 array 포맷은 summary/pending 없음, tokens 필드는 항상 재계산) */
function parseStoredHistory(stored: unknown): ChannelHistoryState {
	if (Array.isArray(stored)) {
		const messages = stored as ChatMessage[];
		return { messages, summary: null, pending: [], tokens: computeTokens(messages) };
	}
	if (stored && typeof stored === 'object') {
		const obj = stored as { messages?: unknown; summary?: unknown; pending?: unknown };
		const messages = Array.isArray(obj.messages) ? (obj.messages as ChatMessage[]) : [];
		return {
			messages,
			summary: typeof obj.summary === 'string' && obj.summary ? obj.summary : null,
			pending: Array.isArray(obj.pending) ? (obj.pending as ChatMessage[]) : [],
			tokens: computeTokens(messages)
		};
	}
	return defaultHistoryState();
}

/**
 * DB에서 기록을 불러와 캐시를 동기화해요. 재시작 후에도 이어지고,
 * 대시보드 등 외부에서 삭제한 기록도 다음 턴에 반영돼요.
 */
export async function loadChannelHistory(channelId: string): Promise<void> {
	try {
		// persist가 대기 중이면 먼저 기록하고 읽어요 — 방금 쓴 턴이 로드에 밀려 유실되지 않게
		await flushChannelHistoryPersist(channelId);
		const row = await container.db.channelChatHistory.findUnique({ where: { channelId } });
		if (!row) {
			channelHistories.delete(channelId);
			emptyChannelIds.add(channelId);
			return;
		}
		emptyChannelIds.delete(channelId);
		channelHistories.set(channelId, parseStoredHistory(row.messages));
		// 옛 기록에 guildId가 없으면 백필 (서버 단위 기록 삭제용)
		const knownGuildId = channelGuilds.get(channelId);
		if (knownGuildId && row.guildId !== knownGuildId) {
			void container.db.channelChatHistory.update({ where: { channelId }, data: { guildId: knownGuildId } }).catch(() => undefined);
		}
	} catch (error) {
		// DB 오류 시 기존 캐시 유지
		container.logger.error('[aiChat] failed to load channel history:', error);
	}
}

function getChannelHistory(channelId: string): ChatMessage[] {
	return channelHistories.get(channelId)?.messages ?? [];
}

export function getChannelHistoryState(channelId: string): ChannelHistoryState {
	return channelHistories.get(channelId) ?? defaultHistoryState();
}

export function clearChannelHistory(channelId: string): number {
	const length = getChannelHistory(channelId).length;
	// 삭제가 방금 예약된 변경을 덮어쓰므로 대기 중 persist를 버려요
	cancelPendingPersist(channelId);
	channelHistories.set(channelId, defaultHistoryState());
	try {
		void container.db.channelChatHistory.delete({ where: { channelId } }).catch(() => undefined);
	} catch {
		// client 미초기화 등은 무시
	}
	return length;
}

/** 채널 삭제 시 캐시·설정 지도와 DB 기록을 함께 비워요 (대시보드 집계에 고아 행이 남지 않게) */
export function dropChannelHistory(channelId: string): void {
	cancelPendingPersist(channelId);
	channelHistories.delete(channelId);
	channelGuilds.delete(channelId);
	emptyChannelIds.delete(channelId);
	try {
		void container.db.channelChatHistory.delete({ where: { channelId } }).catch(() => undefined);
	} catch {
		// client 미초기화 등은 무시
	}
}

function cancelPendingPersist(channelId: string): void {
	const timer = pendingPersists.get(channelId);
	if (timer) {
		clearTimeout(timer);
		pendingPersists.delete(channelId);
	}
}

export function persistChannelHistory(channelId: string): void {
	if (!channelHistories.has(channelId)) return;
	// 이미 예약되어 있으면 그 창의 변경은 타이머가 fire될 때 최신 상태로 함께 기록돼요
	if (pendingPersists.has(channelId)) return;
	const timer = setTimeout(() => {
		pendingPersists.delete(channelId);
		void writeChannelHistory(channelId);
	}, PERSIST_COALESCE_MS);
	timer.unref?.();
	pendingPersists.set(channelId, timer);
}

/** 현재 상태를 DB에 기록해요 — Prisma JSON 컬럼은 plain object를 받으므로 클론 없이 그대로 넘겨요 */
async function writeChannelHistory(channelId: string): Promise<void> {
	const state = channelHistories.get(channelId);
	if (!state) return;
	emptyChannelIds.delete(channelId);
	// JSON 직렬화 클론 없이 plain object를 그대로 넘겨요 — Prisma JSON 컬럼이 plain object를 받고, 타입 경계는 기존과 동일하게 any
	const payload: any = { messages: state.messages, summary: state.summary, pending: state.pending };
	const guildId = channelGuilds.get(channelId) ?? null;
	try {
		await container.db.channelChatHistory.upsert({
			where: { channelId },
			create: { channelId, guildId, messages: payload },
			update: { messages: payload, ...(guildId ? { guildId } : {}) }
		});
	} catch (error) {
		container.logger.error('[aiChat] failed to persist channel history:', error);
	}
}

/** 예약된 persist를 즉시 비워요 — 로드 전 동기화·테스트·종료 대비용 */
export async function flushChannelHistoryPersist(channelId?: string): Promise<void> {
	const ids = channelId ? (pendingPersists.has(channelId) ? [channelId] : []) : [...pendingPersists.keys()];
	if (ids.length === 0) return;
	await Promise.all(
		ids.map((id) => {
			cancelPendingPersist(id);
			return writeChannelHistory(id);
		})
	);
}

/** 히스토리 라인 한 줄 — 프롬프트 조립·토큰 추정·요약 입력에서 공용으로 써요 */
export function historyLine(message: ChatMessage): string {
	const cached = historyLineCache.get(message);
	if (cached !== undefined) return cached;
	const line = buildHistoryLine(message);
	historyLineCache.set(message, line);
	return line;
}

function buildHistoryLine(message: ChatMessage): string {
	if (message.role !== 'user') return `시루: ${contentText(message.content)}`;
	const text = contentText(message.content);
	const images = message.imageCount ? `[이미지 ${message.imageCount}장]` : '';
	const prefix = `${message.author ?? '사용자'}:`;
	return images ? (text ? `${prefix} ${text} ${images}` : `${prefix} ${images}`) : `${prefix} ${text}`;
}

/** 메시지 라인의 토큰 비용 — 1회 계산 후 캐시에서 O(1)으로 가져와요 */
function lineTokens(message: ChatMessage): number {
	let cost = lineTokenCache.get(message);
	if (cost === undefined) {
		cost = estimateTokens(historyLine(message));
		lineTokenCache.set(message, cost);
	}
	return cost;
}

/** 내용이 바뀐 메시지의 라인·토큰 캐시를 무효화해요 */
function invalidateMessageCaches(message: ChatMessage): void {
	historyLineCache.delete(message);
	lineTokenCache.delete(message);
}

function includeMessages(state: ChannelHistoryState, messages: readonly ChatMessage[]): void {
	for (const message of messages) state.tokens += lineTokens(message);
}

function excludeMessages(state: ChannelHistoryState, messages: readonly ChatMessage[]): void {
	for (const message of messages) state.tokens -= lineTokens(message);
}

/**
 * 기록을 토큰 예산·턴 수 상한 안에 넣어요. 넘치는 오래된 메시지는 버리지 않고
 * pending으로 옮겨서 롤링 요약의 원문으로 쓰여요.
 */
function trimHistoryState(state: ChannelHistoryState): void {
	// 1) 턴 수 상한 — 넘치는 앞부분은 pending으로
	if (state.messages.length > HISTORY_MAX_TURNS * 2) {
		const overflow = state.messages.splice(0, state.messages.length - HISTORY_MAX_TURNS * 2);
		excludeMessages(state, overflow);
		state.pending.push(...overflow);
	}
	// 2) 토큰 상한 — 초과한 오래된 메시지를 앞에서부터 pending으로 (shift의 O(n) 이동 대신 head 커서로 1회 splice)
	const cap = Math.floor(getContextTokenBudget() * 0.6);
	let head = 0;
	while (state.messages.length - head > 2 && state.tokens > cap) {
		state.tokens -= lineTokens(state.messages[head]!);
		head++;
	}
	if (head > 0) state.pending.push(...state.messages.splice(0, head));
	// 3) pending 상한 — 요약기가 죽어도 DB가 무한 증식하지 않도록
	if (state.pending.length > SUMMARY_PENDING_MAX) {
		state.pending.splice(0, state.pending.length - SUMMARY_PENDING_MAX);
	}
}

export function pushChannelHistory(channelId: string, ...messages: ChatMessage[]): void {
	const state = getOrCreateHistory(channelId);
	state.messages.push(...messages);
	includeMessages(state, messages);
	trimHistoryState(state);
	persistChannelHistory(channelId);
}

// Discord 메시지 ↔ 기록 동기화 (삭제/편집 반영)

/**
 * Discord에서 삭제된 메시지(들)를 채널 기록에서 제거해요.
 * 사용자 메시지는 바로 뒤 봇 답변과 한 쌍으로 빠져요. 반영한 메시지 수를 돌려줘요.
 */
export async function removeFromChannelHistory(channelId: string, messageIds: ReadonlySet<string>): Promise<number> {
	try {
		// 메모리에 없을 때만 DB 확인 — row 없는 채널은 negative cache로 스킵해요
		if (!channelHistories.has(channelId) && !emptyChannelIds.has(channelId)) {
			await loadChannelHistory(channelId);
		}
		const state = channelHistories.get(channelId);
		if (!state) return 0;

		let removed = 0;
		const kept: ChatMessage[] = [];
		const removedMessages: ChatMessage[] = [];
		for (let i = 0; i < state.messages.length; i++) {
			const message = state.messages[i]!;
			if (message.messageId && messageIds.has(message.messageId)) {
				removed++;
				removedMessages.push(message);
				// 사용자 메시지면 바로 뒤 봇 답변도 함께 제거
				const next = state.messages[i + 1];
				if (message.role === 'user' && next?.role === 'assistant' && next.messageId && !messageIds.has(next.messageId)) {
					removed++;
					removedMessages.push(next);
					i++;
				}
				continue;
			}
			kept.push(message);
		}
		if (removed > 0) {
			excludeMessages(state, removedMessages);
			state.messages = kept;
		}

		const pendingBefore = state.pending.length;
		state.pending = state.pending.filter((m) => !(m.messageId && messageIds.has(m.messageId)));
		const pendingRemoved = pendingBefore - state.pending.length;

		if (removed + pendingRemoved > 0) persistChannelHistory(channelId);
		return removed + pendingRemoved;
	} catch (error) {
		container.logger.error('[aiChat] failed to remove history messages:', error);
		return 0;
	}
}

/**
 * Discord에서 편집된 사용자 메시지를 기록에 반영해요.
 * 봇 답변은 스트리밍 중 자기 편집이라 반영하지 않고, 내용이 비면 삭제로 다뤄요.
 */
export async function updateChannelHistoryMessage(channelId: string, messageId: string, newContent: string): Promise<boolean> {
	try {
		if (!channelHistories.has(channelId) && !emptyChannelIds.has(channelId)) {
			await loadChannelHistory(channelId);
		}
		const state = channelHistories.get(channelId);
		if (!state) return false;

		const index = state.messages.findIndex((m) => m.messageId === messageId);
		if (index === -1) return false;

		if (!newContent.trim()) {
			await removeFromChannelHistory(channelId, new Set([messageId]));
			return true;
		}

		const target = state.messages[index]!;
		if (target.role !== 'user') return false;
		const before = lineTokens(target);
		target.content = newContent;
		invalidateMessageCaches(target);
		state.tokens += lineTokens(target) - before;
		persistChannelHistory(channelId);
		return true;
	} catch (error) {
		container.logger.error('[aiChat] failed to update history message:', error);
		return false;
	}
}

/**
 * 특정 메시지 ID가 AI 어시스턴트의 답변 메시지인지 확인해요.
 * 답장(Reply) 시 봇의 다른 기능성 메시지(컨트롤러, 명령어 결과 등)에 달린 답장으로 AI가 오작동하는 것을 방지해요.
 */
export async function isAiAssistantMessage(channelId: string, messageId: string): Promise<boolean> {
	try {
		if (!channelHistories.has(channelId) && !emptyChannelIds.has(channelId)) {
			await loadChannelHistory(channelId);
		}
		const state = channelHistories.get(channelId);
		if (!state) return false;
		return state.messages.some((m) => m.role === 'assistant' && m.messageId === messageId);
	} catch {
		return false;
	}
}
