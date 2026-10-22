import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ChatServiceError,
	abortChatTurn,
	acquireChannelTurn,
	assertChatEnabled,
	clearChannelHistory,
	collectImageUrls,
	contentText,
	dropChannelHistory,
	estimateTokens,
	extractThinkTokens,
	flushChannelHistoryPersist,
	getAiChatPolicy,
	getChatConfig,
	getContextTokenBudget,
	loadChannelHistory,
	registerChatAbort,
	releaseChannelTurn,
	releaseChatAbort,
	removeFromChannelHistory,
	runChatTurn,
	streamChatCompletion,
	tryConsumeUserTurn,
	updateChannelHistoryMessage
} from './aiChatService.ts';
import { getChannelHistoryState, historyLine, pushChannelHistory } from './aiChat/historyStore.ts';
import { executeAiTool, getAiToolStatus } from './aiTools/index.ts';

const mocks = vi.hoisted(() => ({
	policy: vi.fn(),
	history: vi.fn(),
	channel: vi.fn(),
	memory: vi.fn(),
	persist: vi.fn(),
	deleteRow: vi.fn(),
	updateRow: vi.fn(),
	pushTurn: vi.fn(),
	redisStore: undefined as undefined | { incrementCacheCounter: (key: string, ttl: number) => Promise<number> },
	logger: { error: vi.fn(), warn: vi.fn() }
}));

vi.mock('@sapphire/framework', () => ({
	container: {
		guildService: { getAiSettings: mocks.policy },
		db: {
			channelChatHistory: {
				findUnique: mocks.history,
				upsert: mocks.persist,
				delete: mocks.deleteRow,
				update: mocks.updateRow
			}
		},
		client: { channels: { fetch: mocks.channel } },
		aiMemoryService: { buildPromptBlock: mocks.memory, pushTurn: mocks.pushTurn },
		logger: mocks.logger,
		get redisStore() {
			return mocks.redisStore;
		}
	}
}));
vi.mock('./aiTools/index.ts', () => ({ getAiToolDefinitions: () => [], executeAiTool: vi.fn(), getAiToolStatus: vi.fn(() => '도구 실행 중이에요') }));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

const options = {
	channelId: 'channel',
	prompt: '안녕',
	config: { apiUrl: 'http://llm.invalid/v1', apiKey: '', model: 'test', timeoutMs: 1000, streamUpdateMs: 450, thinkToken: false },
	toolContext: { guildId: 'guild', channelId: 'channel', voiceChannelId: null, member: null, userId: 'user', username: 'user' }
};

function sseResponse(events: string[]) {
	const body = events.map((event) => `data: ${event}\n\n`).join('');
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(body));
			controller.close();
		}
	});
	return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.policy.mockResolvedValue({ mode: 'all', channelIds: [] });
	mocks.history.mockResolvedValue(null);
	mocks.persist.mockResolvedValue({});
	mocks.deleteRow.mockResolvedValue(null);
	mocks.updateRow.mockResolvedValue(null);
	mocks.pushTurn.mockResolvedValue(undefined);
	mocks.redisStore = undefined;
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '반가워요' } }] })));
});
afterEach(async () => {
	// debounce로 예약된 persist가 다음 테스트로 새지 않도록 비우고
	await flushChannelHistoryPersist();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe('AI context preparation', () => {
	it('starts independent context reads together, but waits for them before asking the model', async () => {
		const history = deferred<null>();
		const channel = deferred<null>();
		const memory = deferred<string>();
		mocks.history.mockReturnValue(history.promise);
		mocks.channel.mockReturnValue(channel.promise);
		mocks.memory.mockReturnValue(memory.promise);
		const result = runChatTurn(options);
		await vi.waitFor(() => {
			expect(mocks.history).toHaveBeenCalledTimes(1);
			expect(mocks.channel).toHaveBeenCalledTimes(1);
			expect(mocks.memory).toHaveBeenCalledTimes(1);
		});
		expect(fetch).not.toHaveBeenCalled();
		history.resolve(null);
		channel.resolve(null);
		memory.resolve('사용자 기억: 재즈 선호');
		expect((await result).answer).toBe('반가워요');
		const [, request] = vi.mocked(fetch).mock.calls[0]!;
		expect(JSON.parse(request?.body as string).messages[0].content).toContain('재즈 선호');
	});

	it('does not start context reads or model requests when policy disables chat', async () => {
		mocks.policy.mockResolvedValue({ mode: 'off', channelIds: [] });
		await expect(runChatTurn(options)).rejects.toThrow('이 서버에서 AI 채팅이 꺼져 있어요.');
		expect(mocks.history).not.toHaveBeenCalled();
		expect(mocks.channel).not.toHaveBeenCalled();
		expect(mocks.memory).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('rejects when the channel is outside the allowlist policy', async () => {
		mocks.policy.mockResolvedValue({ mode: 'channels', channelIds: ['other'] });
		await expect(runChatTurn(options)).rejects.toThrow('이 채널에서는 AI 채팅을 사용할 수 없어요.');
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('extractThinkTokens', () => {
	it('returns plain text unchanged when no think tokens are present', () => {
		expect(extractThinkTokens('그냥 답변이에요')).toBe('그냥 답변이에요');
	});

	it('removes the reasoning block and keeps text before and after it', () => {
		const raw = '앞 문장 <think>사용자에게 인사를 하는 게 좋겠다</think>뒷 문장';
		expect(extractThinkTokens(raw)).toBe('앞 문장 뒷 문장');
	});

	it('keeps only the answer when reasoning comes first (typical model output)', () => {
		const raw = '<think>먼저 인사를 해야 해요</think>안녕하세요!';
		expect(extractThinkTokens(raw)).toBe('안녕하세요!');
	});

	it('matches tags case-insensitively while preserving the answer case', () => {
		const raw = '<THINK>생각</THINK>AnSwEr';
		expect(extractThinkTokens(raw)).toBe('AnSwEr');
	});

	it('removes multiple reasoning blocks', () => {
		const raw = '첫 답변 <think>생각 1</think>중간 답변 <think>생각 2</think>끝 답변';
		expect(extractThinkTokens(raw)).toBe('첫 답변 중간 답변 끝 답변');
	});

	it('drops an unterminated reasoning block instead of leaking it', () => {
		const raw = '여기까지 <think>닫히지 않은 추론이 계속돼요';
		expect(extractThinkTokens(raw)).toBe('여기까지 ');
	});
});

describe('contentText', () => {
	it('returns string content as-is', () => {
		expect(contentText('안녕')).toBe('안녕');
	});

	it('joins only text parts from a multimodal content array', () => {
		expect(
			contentText([
				{ type: 'text', text: '앞' },
				{ type: 'image_url', image_url: { url: 'http://x/img.png' } },
				{ type: 'text', text: '뒤' }
			])
		).toBe('앞뒤');
	});
});

describe('estimateTokens', () => {
	it('returns 0 for empty text', () => {
		expect(estimateTokens('')).toBe(0);
	});

	it('weights dense (Korean) characters higher than ascii', () => {
		expect(estimateTokens('hello')).toBe(2); // 5 * 0.28
		expect(estimateTokens('가나다')).toBe(3); // 3 * 0.7
		expect(estimateTokens('ab가')).toBe(2); // 0.56 + 0.7
	});

	it('weights mixed Korean, ascii and whitespace from a single count', () => {
		expect(estimateTokens('안녕 hello 123')).toBe(5); // dense 2 + rest 10 → 1.4 + 2.8
		expect(estimateTokens('   ')).toBe(1); // 3 * 0.28 = 0.84
	});

	it('matches the regex-based reference on assorted input', () => {
		const reference = (text: string): number => {
			// 기존 DENSE_CHARS_RE와 동일한 5개 범위 (한글 자모/호환 자모/자모 확장-A/음절/전각)
			const hits = text.match(/[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\uff00-\uffef]/g)?.length ?? 0;
			return Math.ceil(hits * 0.7 + (text.length - hits) * 0.28);
		};
		for (const sample of [
			'',
			'plain ascii 123',
			'가나다라마바사',
			'한글 and English 42',
			'ᄀᇿ㄰㆏ꥠꥯ힯＀￯',
			'ㄱㄴㄷ ㅏㅑ',
			'ＡＢＣ abc',
			'이모지 😀와 우정'
		]) {
			expect(estimateTokens(sample)).toBe(reference(sample));
		}
	});
});

describe('getContextTokenBudget', () => {
	it('returns the default when the env is unset', () => {
		vi.stubEnv('CHAT_CONTEXT_TOKEN_BUDGET', undefined);
		expect(getContextTokenBudget()).toBe(60_000);
	});

	it('clamps values into the 1500..100000 range', () => {
		vi.stubEnv('CHAT_CONTEXT_TOKEN_BUDGET', '3000');
		expect(getContextTokenBudget()).toBe(3000);
		vi.stubEnv('CHAT_CONTEXT_TOKEN_BUDGET', '100');
		expect(getContextTokenBudget()).toBe(1500);
		vi.stubEnv('CHAT_CONTEXT_TOKEN_BUDGET', '999999');
		expect(getContextTokenBudget()).toBe(100_000);
	});

	it('falls back to the default on non-numeric input', () => {
		vi.stubEnv('CHAT_CONTEXT_TOKEN_BUDGET', 'abc');
		expect(getContextTokenBudget()).toBe(60_000);
	});
});

describe('getChatConfig', () => {
	it('returns null when the model is not configured', () => {
		vi.stubEnv('CHAT_MODEL', undefined);
		vi.stubEnv('OPENAI_COMPATIBLE_API_URL', 'http://x/v1');
		expect(getChatConfig()).toBeNull();
	});

	it('reads endpoints, credentials and knobs from the environment', () => {
		vi.stubEnv('OPENAI_COMPATIBLE_API_URL', ' http://x/v1/ ');
		vi.stubEnv('CHAT_MODEL', ' chat-model ');
		vi.stubEnv('OPENAI_API_KEY', ' key ');
		vi.stubEnv('LLM_API_TIMEOUT_MS', '500');
		vi.stubEnv('CHAT_STREAM_UPDATE_MS', '100');
		vi.stubEnv('ENABLE_THINK_TOKEN', 'TRUE');
		expect(getChatConfig()).toEqual({
			apiUrl: 'http://x/v1',
			apiKey: 'key',
			model: 'chat-model',
			timeoutMs: 1000,
			streamUpdateMs: 200,
			thinkToken: true
		});
	});

	it('uses defaults when optional values are absent', () => {
		vi.stubEnv('OPENAI_COMPATIBLE_API_URL', undefined);
		vi.stubEnv('CHAT_MODEL', 'm');
		vi.stubEnv('OPENAI_API_KEY', undefined);
		vi.stubEnv('LLM_API_TIMEOUT_MS', undefined);
		vi.stubEnv('CHAT_STREAM_UPDATE_MS', undefined);
		vi.stubEnv('ENABLE_THINK_TOKEN', undefined);
		expect(getChatConfig()).toEqual({
			apiUrl: 'http://127.0.0.1:8080/v1',
			apiKey: '',
			model: 'm',
			timeoutMs: 120_000,
			streamUpdateMs: 450,
			thinkToken: false
		});
	});
});

describe('ai chat policy', () => {
	it('returns the permissive fallback for DMs without hitting the service', async () => {
		await expect(getAiChatPolicy(null)).resolves.toEqual({ mode: 'all', channelIds: [] });
		expect(mocks.policy).not.toHaveBeenCalled();
	});

	it('delegates to guildService when a guild is present', async () => {
		mocks.policy.mockResolvedValue({ mode: 'channels', channelIds: ['c1'] });
		await expect(getAiChatPolicy('g1')).resolves.toEqual({ mode: 'channels', channelIds: ['c1'] });
		expect(mocks.policy).toHaveBeenCalledWith('g1');
	});

	it('falls back and logs when the settings lookup fails', async () => {
		mocks.policy.mockRejectedValue(new Error('db down'));
		await expect(getAiChatPolicy('g1')).resolves.toEqual({ mode: 'all', channelIds: [] });
		expect(mocks.logger.error).toHaveBeenCalledOnce();
	});

	it('assertChatEnabled throws ChatServiceError for off mode and unlisted channels', () => {
		expect(() => assertChatEnabled({ mode: 'all', channelIds: [] }, 'c')).not.toThrow();
		expect(() => assertChatEnabled({ mode: 'channels', channelIds: ['c'] }, 'c')).not.toThrow();
		expect(() => assertChatEnabled({ mode: 'off', channelIds: [] }, 'c')).toThrowError(ChatServiceError);
		expect(() => assertChatEnabled({ mode: 'channels', channelIds: [] }, 'c')).toThrowError('이 채널에서는 AI 채팅을 사용할 수 없어요.');
	});
});

describe('collectImageUrls', () => {
	it('filters by type and size, then caps at three urls', () => {
		expect(
			collectImageUrls([
				{ url: 'a', contentType: 'image/png', size: 100 },
				{ url: 'b', contentType: 'image/svg+xml' },
				{ url: 'c', contentType: 'text/plain' },
				{ url: 'd', contentType: 'image/jpeg', size: 11 * 1024 * 1024 },
				{ url: 'e', contentType: 'image/gif' },
				{ url: 'f', contentType: 'IMAGE/WEBP', size: 1 },
				{ url: 'g', contentType: 'image/png' }
			])
		).toEqual(['a', 'e', 'f']);
	});
});

describe('channel turn lock', () => {
	it('allows only one active turn per channel until released', () => {
		expect(acquireChannelTurn('lock-ch')).toBe(true);
		expect(acquireChannelTurn('lock-ch')).toBe(false);
		releaseChannelTurn('lock-ch');
		expect(acquireChannelTurn('lock-ch')).toBe(true);
		releaseChannelTurn('lock-ch');
	});
});

describe('chat abort registry', () => {
	it('aborts the registered controller only for the owner', () => {
		const { key, controller } = registerChatAbort('owner');
		expect(abortChatTurn(key, 'intruder')).toBe('forbidden');
		expect(controller.signal.aborted).toBe(false);
		expect(abortChatTurn(key, 'owner')).toBe('ok');
		expect(controller.signal.aborted).toBe(true);
	});

	it('reports not_found for unknown or released keys', () => {
		expect(abortChatTurn('missing', 'u')).toBe('not_found');
		const { key } = registerChatAbort('owner');
		releaseChatAbort(key);
		expect(abortChatTurn(key, 'owner')).toBe('not_found');
	});
});

describe('tryConsumeUserTurn', () => {
	it('allows the turn when redis is unavailable', async () => {
		await expect(tryConsumeUserTurn('u1')).resolves.toBe(true);
	});

	it('counts within a 10 minute window and rejects above the limit', async () => {
		const incrementCacheCounter = vi.fn();
		mocks.redisStore = { incrementCacheCounter };
		incrementCacheCounter.mockResolvedValueOnce(20);
		await expect(tryConsumeUserTurn('u1')).resolves.toBe(true);
		const [key, ttl] = incrementCacheCounter.mock.calls[0]!;
		expect(key).toMatch(/^ai\/turns\/u1:\d+$/);
		expect(ttl).toBe(600);
		incrementCacheCounter.mockResolvedValueOnce(21);
		await expect(tryConsumeUserTurn('u1')).resolves.toBe(false);
	});
});

describe('channel history store', () => {
	it('removes a user message together with the bot reply that followed it, and filters pending', async () => {
		const channelId = 'hist-remove';
		mocks.history.mockResolvedValueOnce({
			channelId,
			guildId: 'g',
			messages: {
				messages: [
					{ role: 'user', content: 'q1', messageId: 'm1' },
					{ role: 'assistant', content: 'a1', messageId: 'm2' },
					{ role: 'user', content: 'q2', messageId: 'm3' },
					{ role: 'assistant', content: 'a2', messageId: 'm4' }
				],
				summary: null,
				pending: [{ role: 'user', content: 'old', messageId: 'm0' }]
			}
		});
		await expect(removeFromChannelHistory(channelId, new Set(['m1', 'm0']))).resolves.toBe(3);
		await flushChannelHistoryPersist(channelId);
		const payload = mocks.persist.mock.calls.at(-1)?.[0]?.create?.messages;
		expect(payload.messages.map((m: { messageId?: string }) => m.messageId)).toEqual(['m3', 'm4']);
		expect(payload.pending).toEqual([]);
	});

	it('negative-caches channels with no stored row', async () => {
		const channelId = 'hist-empty';
		await expect(removeFromChannelHistory(channelId, new Set(['x']))).resolves.toBe(0);
		await expect(removeFromChannelHistory(channelId, new Set(['y']))).resolves.toBe(0);
		expect(mocks.history).toHaveBeenCalledTimes(1);
	});

	it('updates stored user messages and treats blank edits as deletion', async () => {
		const channelId = 'hist-update';
		mocks.history.mockResolvedValueOnce({
			channelId,
			guildId: null,
			messages: {
				messages: [
					{ role: 'user', content: '원본', messageId: 'u1' },
					{ role: 'assistant', content: '답변', messageId: 'b1' }
				],
				summary: null,
				pending: []
			}
		});
		await expect(updateChannelHistoryMessage(channelId, 'u1', '수정된 내용')).resolves.toBe(true);
		await flushChannelHistoryPersist(channelId);
		expect(mocks.persist.mock.calls.at(-1)?.[0]?.create?.messages.messages[0].content).toBe('수정된 내용');

		await expect(updateChannelHistoryMessage(channelId, 'b1', '봇 답변은 못 바꿔요')).resolves.toBe(false);
		// 빈 편집은 삭제로 처리되고, 삭제된 사용자 메시지의 직후 봇 답변(b1)도 한 쌍으로 함께 빠진다
		await expect(updateChannelHistoryMessage(channelId, 'u1', '   ')).resolves.toBe(true);
		await flushChannelHistoryPersist(channelId);
		expect(mocks.persist.mock.calls.at(-1)?.[0]?.create?.messages.messages).toEqual([]);
	});

	it('parses the legacy array-only storage format', async () => {
		const channelId = 'hist-legacy';
		mocks.history.mockResolvedValueOnce({ channelId, guildId: null, messages: [{ role: 'user', content: '옛날', messageId: 'old1' }] });
		await expect(removeFromChannelHistory(channelId, new Set(['old1']))).resolves.toBe(1);
	});

	it('backfills the guild id when a stored row predates the guild column', async () => {
		const channelId = 'hist-backfill';
		mocks.history.mockResolvedValueOnce({ channelId, guildId: null, messages: { messages: [], summary: null, pending: [] } });
		mocks.channel.mockReturnValueOnce(Promise.resolve(null));
		mocks.memory.mockResolvedValueOnce(null);
		await runChatTurn({ ...options, channelId, toolContext: { ...options.toolContext, guildId: 'guild-9', channelId } });
		await vi.waitFor(() => expect(mocks.updateRow).toHaveBeenCalledWith({ where: { channelId }, data: { guildId: 'guild-9' } }));
	});

	it('clearChannelHistory returns the removed message count and deletes the row', async () => {
		const channelId = 'hist-clear';
		mocks.history.mockResolvedValueOnce({
			channelId,
			guildId: null,
			messages: {
				messages: [
					{ role: 'user', content: 'a' },
					{ role: 'assistant', content: 'b' }
				],
				summary: null,
				pending: []
			}
		});
		await loadChannelHistory(channelId);
		expect(clearChannelHistory(channelId)).toBe(2);
		expect(mocks.deleteRow).toHaveBeenCalledWith({ where: { channelId } });
	});

	it('dropChannelHistory removes cache, guild mapping and the row', async () => {
		const channelId = 'hist-drop';
		mocks.history
			.mockResolvedValueOnce({
				channelId,
				guildId: null,
				messages: { messages: [{ role: 'user', content: 'a', messageId: 'd1' }], summary: null, pending: [] }
			})
			.mockResolvedValueOnce(null);
		await loadChannelHistory(channelId);
		dropChannelHistory(channelId);
		expect(mocks.deleteRow).toHaveBeenCalledWith({ where: { channelId } });
		// 캐시와 negative set이 모두 비워졌으므로 다음 접근은 DB를 다시 조회한다
		await removeFromChannelHistory(channelId, new Set(['d1']));
		expect(mocks.history).toHaveBeenCalledTimes(2);
	});
});

describe('historyLine', () => {
	it('formats speaker prefix, text and image marker without empty joins', () => {
		expect(historyLine({ role: 'user', content: '안녕' })).toBe('사용자: 안녕');
		expect(historyLine({ role: 'user', content: '안녕', author: '철수', imageCount: 2 })).toBe('철수: 안녕 [이미지 2장]');
		expect(historyLine({ role: 'user', content: '', imageCount: 1 })).toBe('사용자: [이미지 1장]');
		expect(historyLine({ role: 'user', content: '' })).toBe('사용자: ');
		expect(historyLine({ role: 'assistant', content: '답변' })).toBe('시루: 답변');
	});
});

describe('channel history persist coalescing', () => {
	it('batches repeated mutations into a single upsert with the latest state', async () => {
		const channelId = 'coalesce-batch';
		pushChannelHistory(channelId, { role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' });
		pushChannelHistory(channelId, { role: 'user', content: 'q2' });
		expect(mocks.persist).not.toHaveBeenCalled();
		await flushChannelHistoryPersist(channelId);
		expect(mocks.persist).toHaveBeenCalledTimes(1);
		const payload = mocks.persist.mock.calls[0]?.[0]?.create?.messages;
		expect(payload.messages).toHaveLength(3);
		// 이미 비워진 채널을 다시 flush해도 중복 기록하지 않는다
		await flushChannelHistoryPersist(channelId);
		expect(mocks.persist).toHaveBeenCalledTimes(1);
	});

	it('auto-flushes once the coalesce window elapses', () => {
		vi.useFakeTimers();
		try {
			const channelId = 'coalesce-window';
			pushChannelHistory(channelId, { role: 'user', content: 'hi' });
			expect(mocks.persist).not.toHaveBeenCalled();
			vi.advanceTimersByTime(500);
			expect(mocks.persist).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('writes pending changes before a reload reads the database', async () => {
		const channelId = 'coalesce-reload';
		pushChannelHistory(channelId, { role: 'user', content: '방금 말한 것' });
		mocks.history.mockResolvedValueOnce({
			channelId,
			guildId: null,
			messages: { messages: [{ role: 'user', content: '방금 말한 것' }], summary: null, pending: [] }
		});
		await loadChannelHistory(channelId);
		expect(mocks.persist).toHaveBeenCalledTimes(1);
		expect(mocks.persist.mock.invocationCallOrder[0]).toBeLessThan(mocks.history.mock.invocationCallOrder[0]);
	});

	it('clearChannelHistory cancels a scheduled write instead of resurrecting the row', async () => {
		const channelId = 'coalesce-clear';
		pushChannelHistory(channelId, { role: 'user', content: '지울 대화' });
		clearChannelHistory(channelId);
		await flushChannelHistoryPersist(channelId);
		expect(mocks.persist).not.toHaveBeenCalled();
		expect(mocks.deleteRow).toHaveBeenCalledWith({ where: { channelId } });
	});
});

describe('incremental history token accounting', () => {
	it('keeps state.tokens equal to a full recompute across load, pushes and trims', async () => {
		vi.stubEnv('CHAT_CONTEXT_TOKEN_BUDGET', '2000');
		const channelId = 'tokens-sync';
		mocks.history.mockResolvedValueOnce({
			channelId,
			guildId: null,
			messages: { messages: [{ role: 'user', content: '이전 대화', messageId: 'old' }], summary: null, pending: [] }
		});
		await loadChannelHistory(channelId);
		for (let i = 0; i < 40; i++) {
			pushChannelHistory(
				channelId,
				{ role: 'user', content: `질문 ${i} ${'내용'.repeat(60)}` },
				{ role: 'assistant', content: `답변 ${i} ${'내용'.repeat(60)}` }
			);
		}
		const state = getChannelHistoryState(channelId);
		const recompute = state.messages.reduce((sum, m) => sum + estimateTokens(historyLine(m)), 0);
		expect(state.tokens).toBe(recompute);
		expect(state.tokens).toBeLessThanOrEqual(1200);
		expect(state.messages.length).toBeGreaterThanOrEqual(2);
		expect(state.messages.length + state.pending.length).toBe(81);
	});
});

describe('streamChatCompletion', () => {
	const config = { apiUrl: 'http://llm.invalid/v1', apiKey: '', model: 'test', timeoutMs: 1000, streamUpdateMs: 450, thinkToken: false };

	it('accumulates streamed deltas and reports cumulative text via onDelta', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					sseResponse([
						'{"choices":[{"delta":{"content":"안녕"}}]}',
						'not a json line',
						'{"choices":[{"delta":{"content":"하세요"}}]}',
						'[DONE]'
					])
				)
		);
		const deltas: string[] = [];
		const result = await streamChatCompletion({ messages: [{ role: 'user', content: 'hi' }], config, onDelta: (text) => void deltas.push(text) });
		expect(result).toEqual({ content: '안녕하세요', toolCalls: [] });
		expect(deltas).toEqual(['안녕', '안녕하세요']);
	});

	it('reassembles tool call chunks split across stream events', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					sseResponse([
						'{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"web_sear","arguments":"{\\"q\\":"}}]}}]}',
						'{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"ch","arguments":"\\"날씨\\"}"}}]}}]}',
						'[DONE]'
					])
				)
		);
		const result = await streamChatCompletion({ messages: [{ role: 'user', content: 'hi' }], config });
		expect(result.content).toBe('');
		expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'web_search', arguments: '{"q":"날씨"}' }]);
	});

	it('uses a completion when the server does not stream', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '배송  조회해드릴게요' } }] })));
		const result = await streamChatCompletion({ messages: [{ role: 'user', content: 'hi' }], config });
		expect(result.content).toBe('배송 조회해드릴게요');
	});

	it('strips think blocks from the final text when thinkToken mode is on', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '<think>추론</think>정답' } }] })));
		const result = await streamChatCompletion({ messages: [{ role: 'user', content: 'hi' }], config: { ...config, thinkToken: true } });
		expect(result.content).toBe('정답');
	});

	it('라이브 화면으로 흘려보내는 중간 본문에도 미정제 추론이 섞이지 않는다', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					sseResponse([
						'{"choices":[{"delta":{"content":"생각 중 "}}]}',
						'{"choices":[{"delta":{"content":"<think>비밀 추론 내용"}}]}',
						'{"choices":[{"delta":{"content":"왜냐하면"}}]}',
						'{"choices":[{"delta":{"content":"</think>정답"}}]}',
						'[DONE]'
					])
				)
		);
		const deltas: string[] = [];
		const result = await streamChatCompletion({
			messages: [{ role: 'user', content: 'hi' }],
			config: { ...config, thinkToken: true },
			onDelta: (text) => void deltas.push(text)
		});

		expect(result.content).toBe('생각 중 정답');
		expect(deltas.join('\n')).not.toContain('비밀 추론 내용');
		expect(deltas.at(-1)).toBe('생각 중 정답');
	});

	it('sends the bearer token only when an api key is configured', async () => {
		const fetchMock = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: 'ok' } }] }));
		vi.stubGlobal('fetch', fetchMock);
		await streamChatCompletion({ messages: [{ role: 'user', content: 'hi' }], config: { ...config, apiKey: 'secret' } });
		expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer secret' });
	});

	it('maps transport failures, http errors and empty answers to ChatServiceError', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
		await expect(streamChatCompletion({ messages: [{ role: 'user', content: 'hi' }], config })).rejects.toMatchObject({
			identifier: 'chat_unreachable'
		});

		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
		await expect(streamChatCompletion({ messages: [{ role: 'user', content: 'hi' }], config })).rejects.toMatchObject({
			identifier: 'chat_http_error'
		});

		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(['[DONE]'])));
		await expect(streamChatCompletion({ messages: [{ role: 'user', content: 'hi' }], config })).rejects.toMatchObject({
			identifier: 'chat_empty_response'
		});
	});

	it('distinguishes a user abort from a timeout', async () => {
		const slowFetch = vi.fn(
			(_url: string, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted', 'AbortError')));
				})
		);
		vi.stubGlobal('fetch', slowFetch);

		const controller = new AbortController();
		const cancelled = streamChatCompletion({ messages: [{ role: 'user', content: 'hi' }], config, signal: controller.signal }).catch(
			(e: unknown) => e
		);
		controller.abort();
		await expect(cancelled).resolves.toMatchObject({ identifier: 'chat_cancelled' });

		await expect(
			streamChatCompletion({ messages: [{ role: 'user', content: 'hi' }], config: { ...config, timeoutMs: 20 } })
		).rejects.toMatchObject({
			identifier: 'chat_timeout'
		});
	});
});

describe('runChatTurn agent loop', () => {
	it('executes tool calls and feeds the results back for a final answer', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					choices: [
						{ message: { content: '', tool_calls: [{ id: 'c1', function: { name: 'memory_save', arguments: '{"facts":["x"]}' } }] } }
					]
				})
			)
			.mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '기억했어요' } }] }));
		vi.stubGlobal('fetch', fetchMock);
		vi.mocked(executeAiTool).mockResolvedValue('{"status":"ok"}');

		const result = await runChatTurn({
			...options,
			channelId: 'agent-tools',
			toolContext: { ...options.toolContext, channelId: 'agent-tools' },
			onStatus: vi.fn()
		});
		expect(result).toEqual({ answer: '기억했어요', memoryUpdated: true });
		expect(vi.mocked(getAiToolStatus)).toHaveBeenCalledWith('memory_save', '{"facts":["x"]}');
		expect(executeAiTool).toHaveBeenCalledWith('memory_save', '{"facts":["x"]}', expect.objectContaining({ userId: 'user' }));

		const [, secondRequest] = fetchMock.mock.calls[1]!;
		const messages = JSON.parse(secondRequest?.body as string).messages;
		expect(messages[2]).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'c1', function: { name: 'memory_save' } }] });
		expect(messages[3]).toMatchObject({ role: 'tool', tool_call_id: 'c1', content: '{"status":"ok"}' });
		expect(mocks.pushTurn).toHaveBeenCalledWith('user', 'agent-tools', '안녕', '기억했어요');
	});

	it('stops before calling the model when the user already cancelled', async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(runChatTurn({ ...options, signal: controller.signal })).rejects.toMatchObject({ identifier: 'chat_cancelled' });
		expect(fetch).not.toHaveBeenCalled();
	});

	it('strips think tokens from the final answer when thinkToken mode is on', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '<think>생각</think>실제 답변' } }] })));
		const result = await runChatTurn({
			...options,
			channelId: 'agent-think',
			config: { ...options.config, thinkToken: true },
			toolContext: { ...options.toolContext, channelId: 'agent-think' }
		});
		expect(result.answer).toBe('실제 답변');
	});

	it('sends image attachments as multimodal content parts', async () => {
		const fetchMock = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '고양이네요' } }] }));
		vi.stubGlobal('fetch', fetchMock);
		const result = await runChatTurn({
			...options,
			channelId: 'agent-image',
			prompt: '이게 뭐야?',
			images: ['http://x/cat.png'],
			toolContext: { ...options.toolContext, channelId: 'agent-image' }
		});
		expect(result.answer).toBe('고양이네요');
		const [, request] = fetchMock.mock.calls[0]!;
		expect(JSON.parse(request?.body as string).messages[1].content).toEqual([
			{ type: 'text', text: '이게 뭐야?' },
			{ type: 'image_url', image_url: { url: 'http://x/cat.png' } }
		]);
	});
});
