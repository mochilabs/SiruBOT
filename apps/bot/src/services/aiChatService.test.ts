import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runChatTurn } from './aiChatService.ts';

const mocks = vi.hoisted(() => ({
	policy: vi.fn(),
	history: vi.fn(),
	channel: vi.fn(),
	memory: vi.fn(),
	persist: vi.fn(),
	pushTurn: vi.fn(),
	logger: { error: vi.fn() }
}));

vi.mock('@sapphire/framework', () => ({
	container: {
		guildService: { getAiSettings: mocks.policy },
		db: { channelChatHistory: { findUnique: mocks.history, upsert: mocks.persist } },
		client: { channels: { fetch: mocks.channel } },
		aiMemoryService: { buildPromptBlock: mocks.memory, pushTurn: mocks.pushTurn },
		logger: mocks.logger
	}
}));
vi.mock('./aiTools/index.ts', () => ({ getAiToolDefinitions: () => [], executeAiTool: vi.fn(), getAiToolStatus: vi.fn() }));

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

describe('AI context preparation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.policy.mockResolvedValue({ mode: 'all', channelIds: [] });
		mocks.persist.mockResolvedValue({});
		mocks.pushTurn.mockResolvedValue(undefined);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '반가워요' } }] })));
	});
	afterEach(() => vi.unstubAllGlobals());

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
});
