import { container } from '@sapphire/framework';
import { estimateTokens, getContextTokenBudget } from './tokenBudget.ts';
import { contentText, type ChannelHistoryState, type ChatMessage } from './types.ts';

const HISTORY_MAX_TURNS = 150;
/** 요약기가 장시간 실패해도 기록이 무한 증식하지 않도록 하는 pending 상한 */
const SUMMARY_PENDING_MAX = 120;

const channelHistories = new Map<string, ChannelHistoryState>();
/** row가 없다고 확인된 채널 — 메시지 삭제 리스너의 불필요한 DB 조회를 줄여요 */
const emptyChannelIds = new Set<string>();
/** channelId → guildId (persist 시 guildId 기록용, 대시보드 서버 단위 삭제를 위함) */
const channelGuilds = new Map<string, string>();

function defaultHistoryState(): ChannelHistoryState {
	return { messages: [], summary: null, pending: [] };
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

/** 저장된 JSON을 ChannelHistoryState로 해석해요 (옛 array 포맷은 summary/pending 없음) */
function parseStoredHistory(stored: unknown): ChannelHistoryState {
	if (Array.isArray(stored)) return { messages: stored as ChatMessage[], summary: null, pending: [] };
	if (stored && typeof stored === 'object') {
		const obj = stored as { messages?: unknown; summary?: unknown; pending?: unknown };
		return {
			messages: Array.isArray(obj.messages) ? (obj.messages as ChatMessage[]) : [],
			summary: typeof obj.summary === 'string' && obj.summary ? obj.summary : null,
			pending: Array.isArray(obj.pending) ? (obj.pending as ChatMessage[]) : []
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
	channelHistories.delete(channelId);
	channelGuilds.delete(channelId);
	emptyChannelIds.delete(channelId);
	try {
		void container.db.channelChatHistory.delete({ where: { channelId } }).catch(() => undefined);
	} catch {
		// client 미초기화 등은 무시
	}
}

export function persistChannelHistory(channelId: string): void {
	const state = channelHistories.get(channelId);
	if (!state) return;
	const payload = JSON.parse(JSON.stringify({ messages: state.messages, summary: state.summary, pending: state.pending }));
	emptyChannelIds.delete(channelId);
	const guildId = channelGuilds.get(channelId) ?? null;
	try {
		void container.db.channelChatHistory
			.upsert({
				where: { channelId },
				create: { channelId, guildId, messages: payload },
				update: { messages: payload, ...(guildId ? { guildId } : {}) }
			})
			.catch((error) => container.logger.error('[aiChat] failed to persist channel history:', error));
	} catch (error) {
		container.logger.error('[aiChat] failed to persist channel history:', error);
	}
}

/** 히스토리 라인 한 줄 — 프롬프트 조립·토큰 추정·요약 입력에서 공용으로 써요 */
export function historyLine(message: ChatMessage): string {
	if (message.role !== 'user') return `시루: ${contentText(message.content)}`;
	const text = contentText(message.content);
	const images = message.imageCount ? `[이미지 ${message.imageCount}장]` : '';
	return `${message.author ?? '사용자'}: ${[text, images].filter(Boolean).join(' ')}`;
}

/**
 * 기록을 토큰 예산·턴 수 상한 안에 넣어요. 넘치는 오래된 메시지는 버리지 않고
 * pending으로 옮겨서 롤링 요약의 원문으로 쓰여요.
 */
function trimHistoryState(state: ChannelHistoryState): void {
	// 1) 턴 수 상한 — 넘치는 앞부분은 pending으로
	if (state.messages.length > HISTORY_MAX_TURNS * 2) {
		const overflow = state.messages.splice(0, state.messages.length - HISTORY_MAX_TURNS * 2);
		state.pending.push(...overflow);
	}
	// 2) 토큰 상한 — 초과한 오래된 메시지를 앞에서부터 pending으로
	const cap = Math.floor(getContextTokenBudget() * 0.6);
	let tokens = state.messages.reduce((sum, m) => sum + estimateTokens(historyLine(m)), 0);
	while (state.messages.length > 2 && tokens > cap) {
		const removed = state.messages.shift()!;
		tokens -= estimateTokens(historyLine(removed));
		state.pending.push(removed);
	}
	// 3) pending 상한 — 요약기가 죽어도 DB가 무한 증식하지 않도록
	if (state.pending.length > SUMMARY_PENDING_MAX) {
		state.pending.splice(0, state.pending.length - SUMMARY_PENDING_MAX);
	}
}

export function pushChannelHistory(channelId: string, ...messages: ChatMessage[]): void {
	const state = getOrCreateHistory(channelId);
	state.messages.push(...messages);
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
		for (let i = 0; i < state.messages.length; i++) {
			const message = state.messages[i]!;
			if (message.messageId && messageIds.has(message.messageId)) {
				removed++;
				// 사용자 메시지면 바로 뒤 봇 답변도 함께 제거
				const next = state.messages[i + 1];
				if (message.role === 'user' && next?.role === 'assistant' && next.messageId && !messageIds.has(next.messageId)) {
					removed++;
					i++;
				}
				continue;
			}
			kept.push(message);
		}
		if (removed > 0) state.messages = kept;

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
		target.content = newContent;
		persistChannelHistory(channelId);
		return true;
	} catch (error) {
		container.logger.error('[aiChat] failed to update history message:', error);
		return false;
	}
}
