import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AttachmentBuilder, Collection, MessagePayload, type ChatInputCommandInteraction, type Message } from 'discord.js';
import type { CustomPlayer } from './customPlayer.ts';
import { PlayerNotifier } from './playerNotifier.ts';

const mocks = vi.hoisted(() => ({
	send: vi.fn(),
	guild: vi.fn(),
	pinned: vi.fn(),
	cached: vi.fn(),
	render: vi.fn(),
	clear: vi.fn(),
	edits: vi.fn(),
	logger: { debug: vi.fn(), trace: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('@sapphire/framework', () => ({
	UserError: class extends Error {
		constructor({ message }: { message: string }) {
			super(message);
		}
	},
	container: {
		logger: { getSubLogger: () => mocks.logger },
		guildService: { getGuild: mocks.guild, getPinnedChannel: mocks.pinned },
		client: { channels: { cache: new Map([['channel', { isSendable: () => true, send: mocks.send }]]) } }
	}
}));
vi.mock('./nowPlayingCard.ts', () => ({
	getCachedNowPlayingCard: mocks.cached,
	getDisplayNowPlayingCard: mocks.cached,
	getNowPlayingCardKey: (player: CustomPlayer) => player.queue.current?.info.identifier ?? null,
	resolveNowPlayingCard: mocks.render,
	clearNowPlayingCard: mocks.clear
}));
vi.mock('../../view/controller.ts', () => ({
	controllerView: ({ player, volume, nowPlayingCardUrl }: { player: CustomPlayer; volume: number; nowPlayingCardUrl?: string }) => {
		const snapshot = {
			track: player.queue.current?.info.identifier,
			paused: player.paused,
			second: Math.floor(player.position / 1000),
			volume,
			nowPlayingCardUrl
		};
		return { toJSON: () => snapshot };
	}
}));

interface TestMessage {
	id: string;
	editable: boolean;
	deletable: boolean;
	attachments: Collection<string, { id: string; name: string }>;
	edit: Mock;
	delete: Mock;
}

function applyAttachments(result: TestMessage, payload: { files: AttachmentBuilder[]; attachments?: { id: string }[] }) {
	// discord.js의 실제 변환을 사용해 files: []가 기존 첨부를 제거하는 동작도 검증한다.
	const target = { client: { options: {} } } as unknown as Message;
	const body = new MessagePayload(target, { files: payload.files, attachments: payload.attachments?.map((file) => ({ ...file })) }).resolveBody()
		.body!;
	const keptIds = new Set('attachments' in body ? body.attachments?.map((file) => file.id) : []);
	result.attachments = result.attachments.filter((file) => keptIds.has(file.id));
	for (const file of payload.files) {
		const id = `attachment-${file.name}`;
		result.attachments.set(id, { id, name: file.name! });
	}
}

function message(id: string): TestMessage {
	const result: TestMessage = {
		id,
		editable: true,
		deletable: true,
		attachments: new Collection(),
		edit: vi.fn(),
		delete: vi.fn().mockResolvedValue(undefined)
	};
	result.edit.mockImplementation(async (payload: { files: AttachmentBuilder[]; attachments?: { id: string }[] }) => {
		mocks.edits(id, payload);
		const clone = message(id);
		clone.attachments = new Collection(result.attachments);
		applyAttachments(clone, payload);
		return clone as unknown as Message;
	});
	return result;
}

function player(): CustomPlayer {
	return {
		guildId: 'guild',
		textChannelId: 'channel',
		messageId: null,
		controller: null,
		paused: false,
		position: 0,
		queue: { current: { info: { identifier: 'a' } }, tracks: [] }
	} as unknown as CustomPlayer;
}

function pending<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

function card(trackKey = 'a::p0') {
	return {
		filename: 'card.png',
		url: 'attachment://card.png',
		fresh: false,
		trackKey,
		file: new AttachmentBuilder(Buffer.from('card'), { name: 'card.png' })
	};
}

describe('non-blocking player notifications', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.guild.mockResolvedValue({ enableController: true, volume: 10 });
		mocks.pinned.mockResolvedValue(null);
		mocks.cached.mockReturnValue(null);
		mocks.render.mockResolvedValue(null);
		let sequence = 0;
		mocks.send.mockImplementation(async (payload: { files: AttachmentBuilder[] }) => {
			const result = message(`message-${++sequence}`);
			applyAttachments(result, payload);
			return result;
		});
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('sends the basic controller while the image is still pending, then attaches it', async () => {
		const rendering = pending<ReturnType<typeof card> | null>();
		mocks.render.mockReturnValue(rendering.promise);
		const current = player();
		await new PlayerNotifier().sendController(current);
		expect(mocks.send).toHaveBeenCalledTimes(1);
		expect(mocks.send.mock.calls[0]![0].files).toEqual([]);
		expect(current.messageId).toBe('message-1');
		expect(mocks.edits).not.toHaveBeenCalled();
		current.paused = true;
		mocks.cached.mockReturnValue(card());
		rendering.resolve(card());
		await vi.waitFor(() => expect(mocks.edits).toHaveBeenCalledTimes(1));
		const payload = mocks.edits.mock.calls[0]![1];
		expect(payload.components[0].toJSON().paused).toBe(true);
		expect(payload.files).toHaveLength(1);
		expect(current.controller?.attachments.size).toBe(1);
	});

	it('finishes a deferred slash reply without waiting for the card or fetching the reply again', async () => {
		mocks.render.mockReturnValue(pending().promise);
		const editReply = vi.fn().mockResolvedValue(message('slash'));
		const interaction = { deferred: true, replied: false, editReply, reply: vi.fn(), fetchReply: vi.fn(), channelId: 'channel' };
		await new PlayerNotifier().sendController(player(), interaction as unknown as ChatInputCommandInteraction);
		expect(editReply).toHaveBeenCalledTimes(1);
		expect(interaction.reply).not.toHaveBeenCalled();
		expect(interaction.fetchReply).not.toHaveBeenCalled();
	});

	it('uses the callback message for a direct reply without an extra fetch', async () => {
		const reply = vi.fn().mockResolvedValue({ resource: { message: message('slash') } });
		const interaction = { deferred: false, replied: false, reply, fetchReply: vi.fn(), channelId: 'channel' };
		await new PlayerNotifier().sendController(player(), interaction as unknown as ChatInputCommandInteraction);
		expect(reply.mock.calls[0]![0].withResponse).toBe(true);
		expect(interaction.fetchReply).not.toHaveBeenCalled();
	});

	it('attaches a prepared card to a new message without starting another render', async () => {
		mocks.cached.mockReturnValue(card());
		await new PlayerNotifier().sendController(player());
		expect(mocks.send.mock.calls[0]![0].files).toHaveLength(1);
		expect(mocks.render).not.toHaveBeenCalled();
	});

	it('skips unchanged updates while sharing one pending image refresh', async () => {
		vi.useFakeTimers();
		mocks.render.mockReturnValue(pending().promise);
		const notifier = new PlayerNotifier();
		const current = player();
		await notifier.sendController(current);
		for (let i = 0; i < 5; i++) {
			notifier.updateController(current);
			await vi.advanceTimersByTimeAsync(300);
		}
		expect(mocks.edits).not.toHaveBeenCalled();
		expect(mocks.render).toHaveBeenCalledTimes(1);
		Object.defineProperty(current, 'position', { value: 1000 });
		notifier.updateController(current);
		await vi.advanceTimersByTimeAsync(300);
		expect(mocks.edits).toHaveBeenCalledTimes(1);
		notifier.updateController(current);
		await vi.advanceTimersByTimeAsync(300);
		expect(mocks.edits).toHaveBeenCalledTimes(1);
	});

	it('does not re-upload a cached attachment on every update', async () => {
		vi.useFakeTimers();
		const notifier = new PlayerNotifier();
		const current = player();
		await notifier.sendController(current);
		mocks.cached.mockReturnValue(card());
		notifier.updateController(current);
		await vi.advanceTimersByTimeAsync(300);
		expect(mocks.edits.mock.calls[0]![1].files).toHaveLength(1);
		Object.defineProperty(current, 'position', { value: 1000 });
		notifier.updateController(current);
		await vi.advanceTimersByTimeAsync(300);
		expect(mocks.edits.mock.calls[1]![1].files).toEqual([]);
		expect(current.controller?.attachments.size).toBe(1);
		expect(current.controller?.attachments.first()?.name).toBe('card.png');
	});

	it('replaces the previous track attachment instead of accumulating cards in a pinned message', async () => {
		vi.useFakeTimers();
		mocks.cached.mockReturnValue(card());
		const notifier = new PlayerNotifier();
		const current = player();
		await notifier.sendController(current);
		current.queue.current!.info.identifier = 'b';
		mocks.cached.mockReturnValue({
			...card('b::p0'),
			filename: 'next.png',
			url: 'attachment://next.png',
			file: new AttachmentBuilder(Buffer.from('next'), { name: 'next.png' })
		});
		notifier.updateController(current);
		await vi.advanceTimersByTimeAsync(300);
		expect(current.controller?.attachments.size).toBe(1);
		expect(current.controller?.attachments.first()?.name).toBe('next.png');
	});

	it('replaces the attachment bytes in place when a new five-second bucket renders', async () => {
		vi.useFakeTimers();
		const notifier = new PlayerNotifier();
		const current = player();
		await notifier.sendController(current);
		mocks.cached.mockReturnValue(card('a::p0'));
		notifier.updateController(current);
		await vi.advanceTimersByTimeAsync(300);
		expect(mocks.edits).toHaveBeenCalledTimes(1);
		mocks.cached.mockReturnValue(card('a::p1'));
		notifier.updateController(current);
		await vi.advanceTimersByTimeAsync(300);
		const payload = mocks.edits.mock.calls[1]![1];
		// 같은 파일명으로 바이트를 교체 첨부 — 기존 첨부는 전부 치운다(누적 방지).
		expect(payload.files).toHaveLength(1);
		expect(payload.attachments).toEqual([]);
		expect(current.controller?.attachments.size).toBe(1);
		expect(current.controller?.attachments.first()?.name).toBe('card.png');
		// 같은 버킷을 다시 그려도 no-op이다.
		notifier.updateController(current);
		await vi.advanceTimersByTimeAsync(300);
		expect(mocks.edits).toHaveBeenCalledTimes(2);
	});

	it('does not restore a deleted controller when its old card finishes', async () => {
		const rendering = pending<ReturnType<typeof card> | null>();
		mocks.render.mockReturnValue(rendering.promise);
		const notifier = new PlayerNotifier();
		const current = player();
		await notifier.sendController(current);
		await notifier.deleteController(current);
		mocks.cached.mockReturnValue(card());
		rendering.resolve(card());
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(current.controller).toBeNull();
		expect(mocks.edits).not.toHaveBeenCalled();
	});

	it('does not revive a controller after deletion while the send is in flight', async () => {
		const posting = pending<TestMessage>();
		mocks.send.mockReturnValue(posting.promise);
		const notifier = new PlayerNotifier();
		const current = player();
		const result = notifier.sendController(current);
		await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
		await notifier.deleteController(current);
		const stale = message('stale');
		posting.resolve(stale);
		await result;
		expect(stale.delete).toHaveBeenCalledTimes(1);
		expect(current.messageId).toBeNull();
		expect(mocks.render).not.toHaveBeenCalled();
	});

	it('skips queued controller sends after the player is destroyed', async () => {
		const posting = pending<TestMessage>();
		mocks.send.mockReturnValue(posting.promise);
		const notifier = new PlayerNotifier();
		const current = player();
		const first = notifier.sendController(current);
		await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
		const second = notifier.sendController(current);
		await notifier.onPlayerDestroy(current);
		posting.resolve(message('stale'));
		await Promise.all([first, second]);
		expect(mocks.send).toHaveBeenCalledTimes(1);
		expect(current.messageId).toBeNull();
	});

	it('does not start another image request after a pending edit finishes on a destroyed player', async () => {
		vi.useFakeTimers();
		const editing = pending<TestMessage>();
		const notifier = new PlayerNotifier();
		const current = player();
		await notifier.sendController(current);
		(current.controller!.edit as Mock).mockReturnValue(editing.promise);
		Object.defineProperty(current, 'position', { value: 1000 });
		notifier.updateController(current);
		await vi.advanceTimersByTimeAsync(300);
		await notifier.onPlayerDestroy(current);
		editing.resolve(message('message-1'));
		await vi.advanceTimersByTimeAsync(0);
		expect(mocks.render).toHaveBeenCalledTimes(1);
		expect(current.controller).toBeNull();
	});

	it('recreates a missing pinned controller without blocking the next queued update', async () => {
		vi.useFakeTimers();
		mocks.pinned.mockResolvedValue('channel');
		const notifier = new PlayerNotifier();
		const current = player();
		await notifier.sendController(current);
		(current.controller!.edit as Mock).mockRejectedValue({ code: 10008 });
		Object.defineProperty(current, 'position', { value: 1000, configurable: true });
		notifier.updateController(current);
		await vi.advanceTimersByTimeAsync(300);
		expect(mocks.send).toHaveBeenCalledTimes(2);
		expect(current.messageId).toBe('message-2');
		Object.defineProperty(current, 'position', { value: 2000 });
		notifier.updateController(current);
		await vi.advanceTimersByTimeAsync(300);
		expect(mocks.edits).toHaveBeenCalledTimes(1);
		expect(mocks.edits.mock.calls[0]![0]).toBe('message-2');
	});

	it('does not recreate a pinned controller if it is cleared while checking the channel', async () => {
		vi.useFakeTimers();
		const pinLookup = pending<string | null>();
		mocks.pinned.mockReturnValue(pinLookup.promise);
		const notifier = new PlayerNotifier();
		const current = player();
		await notifier.sendController(current);
		(current.controller!.edit as Mock).mockRejectedValue({ code: 10008 });
		Object.defineProperty(current, 'position', { value: 1000 });
		notifier.updateController(current);
		await vi.advanceTimersByTimeAsync(300);
		expect(mocks.pinned).toHaveBeenCalledTimes(1);
		await notifier.deleteController(current);
		pinLookup.resolve('channel');
		await vi.advanceTimersByTimeAsync(0);
		expect(mocks.send).toHaveBeenCalledTimes(1);
		expect(current.messageId).toBeNull();
	});

	it('does not attach an old card after the current track changes', async () => {
		const rendering = pending<ReturnType<typeof card> | null>();
		mocks.render.mockReturnValue(rendering.promise);
		const current = player();
		await new PlayerNotifier().sendController(current);
		current.queue.current!.info.identifier = 'b';
		mocks.cached.mockReturnValue(card());
		rendering.resolve(card());
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mocks.edits).not.toHaveBeenCalled();
	});

	it('hydrates an explicitly requested controller even when automatic controllers are disabled', async () => {
		mocks.guild.mockResolvedValue({ enableController: false, volume: 10 });
		const rendering = pending<ReturnType<typeof card> | null>();
		mocks.render.mockReturnValue(rendering.promise);
		const interaction = { deferred: true, editReply: vi.fn().mockResolvedValue(message('slash')), channelId: 'channel' };
		await new PlayerNotifier().sendController(player(), interaction as unknown as ChatInputCommandInteraction);
		mocks.cached.mockReturnValue(card());
		rendering.resolve(card());
		await vi.waitFor(() => expect(mocks.edits).toHaveBeenCalledTimes(1));
	});

	it('removes a deferred loading response and propagates a failed send', async () => {
		const error = new Error('Discord request failed');
		const interaction = { deferred: true, editReply: vi.fn().mockRejectedValue(error), deleteReply: vi.fn().mockResolvedValue(undefined) };
		await expect(new PlayerNotifier().sendController(player(), interaction as unknown as ChatInputCommandInteraction)).rejects.toThrow(error);
		expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
	});
});
