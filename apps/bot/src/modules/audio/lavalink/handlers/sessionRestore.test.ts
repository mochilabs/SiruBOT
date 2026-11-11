import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setConfigForTesting } from '../../../../core/config.ts';
import { makeTestConfig } from '../../../../core/config.testing.ts';
import { container, ListenerStore } from '@sapphire/framework';
import { GatewayDispatchEvents, type GatewayDispatchPayload } from 'discord.js';
import { DefaultQueueStore, LavalinkManager, type Track } from 'lavalink-client';
import { Logger, type ILogObj } from 'tslog';
import { CustomPlayer } from '../player/customPlayer.ts';
import { RawEvent } from '../../listeners/raw.ts';
import { SessionRestoreEngine } from './sessionRestore.ts';
import { NodeHandler } from './nodeHandler.ts';

const BOT_ID = '123456789012345678';
const GUILD_ID = '123456789012345679';
const VOICE_ID = '123456789012345680';

function voiceState(channelId: string | null, userId = BOT_ID): GatewayDispatchPayload {
	return {
		op: 0,
		s: 1,
		t: GatewayDispatchEvents.VoiceStateUpdate,
		d: {
			guild_id: GUILD_ID,
			user_id: userId,
			channel_id: channelId,
			session_id: 'discord-session',
			deaf: false,
			mute: false,
			self_deaf: true,
			self_mute: false,
			self_video: false,
			request_to_speak_timestamp: null,
			suppress: false
		}
	};
}

function track(identifier: string): Track {
	return {
		encoded: `encoded-${identifier}`,
		pluginInfo: {},
		info: {
			identifier,
			title: identifier,
			author: 'Siru',
			duration: 100_000,
			artworkUrl: null,
			uri: `https://youtube.com/watch?v=${identifier}`,
			sourceName: 'youtube',
			isSeekable: true,
			isStream: false,
			isrc: null
		}
	};
}

function setup(destroyPlayer = true) {
	const voice: { channelId: string | null } = { channelId: VOICE_ID };
	const sends: { channelId: string | null; player: CustomPlayer | undefined }[] = [];
	const queueStore = new DefaultQueueStore();
	queueStore.set(GUILD_ID, { current: null, previous: [], tracks: [] });
	const manager = new LavalinkManager<CustomPlayer>({
		nodes: [{ id: 'main', host: 'localhost', port: 2333, authorization: 'test' }],
		client: { id: BOT_ID },
		playerClass: CustomPlayer,
		playerOptions: { onDisconnect: { destroyPlayer, autoReconnect: true } },
		queueOptions: { queueStore },
		sendToShard: (_guildId, payload) => {
			sends.push({ channelId: payload.d.channel_id, player: manager.getPlayer(GUILD_ID) });
		}
	});
	manager.initiated = true;
	const node = manager.nodeManager.nodes.get('main');
	if (!node) throw new Error('Missing test node');
	node.sessionId = 'fresh-session';
	const updatePlayer = vi.spyOn(node, 'updatePlayer').mockResolvedValue({
		guildId: GUILD_ID,
		volume: 100,
		paused: false,
		voice: { token: 'test', endpoint: 'localhost', sessionId: 'discord-session' },
		filters: {},
		state: { time: Date.now(), position: 0, connected: true, ping: 1 }
	});
	const logger = new Logger<ILogObj>({ type: 'hidden' });
	Object.assign(container, {
		audio: manager,
		logger,
		client: { user: { id: BOT_ID }, guilds: { cache: new Map([[GUILD_ID, { members: { me: { voice } } }]]) } },
		mixerService: {
			markFiltersStale: vi.fn(),
			enableMixerFilter: vi.fn(async () => undefined),
			pushCrossfadeConfig: vi.fn(async () => undefined),
			reset: vi.fn(async () => undefined),
			reconcileAfterResume: vi.fn(async () => undefined)
		}
	});
	const raw = new RawEvent({ name: 'raw', path: import.meta.filename, root: process.cwd(), store: new ListenerStore() });
	const original = manager.createPlayer({ guildId: GUILD_ID, voiceChannelId: VOICE_ID, node: 'main' });
	const saved = { ...original.toJSON(), savedAt: Date.now() };
	manager.deletePlayer(GUILD_ID);
	const engine = new SessionRestoreEngine(logger);
	const restore = () => engine.recreateSavedPlayer(node, GUILD_ID, saved, { resetVoiceState: true });
	return { voice, sends, manager, node, raw, saved, engine, restore, queueStore, updatePlayer };
}

// Config는 테스트마다 기본값으로 초기화해요 (환경 변수는 건드리지 않아요)
beforeEach(() => setConfigForTesting(makeTestConfig()));
afterEach(() => setConfigForTesting(null));

describe('fresh restore voice reconnect', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it.each([true, false])('creates a player, leaves and reconnects once (destroyPlayer=%s)', async (destroyPlayer) => {
		const { voice, sends, manager, raw, restore, queueStore } = setup(destroyPlayer);
		const current = track('current');
		const next = track('next');
		queueStore.set(GUILD_ID, { current, tracks: [next], previous: [] });
		const restoring = restore();
		await vi.advanceTimersByTimeAsync(0);

		expect(sends.map((send) => send.channelId)).toEqual([null]);
		expect(sends[0].player).toBeInstanceOf(CustomPlayer);
		raw.run(voiceState(null));
		voice.channelId = null;
		await vi.advanceTimersByTimeAsync(100);
		const restored = await restoring;

		expect(sends.map((send) => send.channelId)).toEqual([null, VOICE_ID]);
		expect(manager.getPlayer(GUILD_ID)).toBe(restored);
		expect(restored.queue.current).toEqual(current);
		expect(restored.queue.tracks).toEqual([next]);
		expect(restored.resettingVoice).toBe(false);
	});

	it('does not reconnect if Discord never acknowledges the leave', async () => {
		const { sends, restore, raw, manager, queueStore } = setup();
		const current = track('current');
		queueStore.set(GUILD_ID, { current, tracks: [], previous: [] });
		const restoring = restore().catch((error: unknown) => error);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(await restoring).toMatchObject({ message: expect.stringContaining('voice leave not confirmed') });
		expect(sends.map((send) => send.channelId)).toEqual([null]);
		await raw.run(voiceState(null));
		expect(manager.getPlayer(GUILD_ID)).toBeUndefined();
		expect(queueStore.get(GUILD_ID)).toMatchObject({ current });
	});

	it('restores the queue, position, pause and filters only after reconnecting', async () => {
		const { engine, node, saved, voice, sends, manager, raw, queueStore, updatePlayer } = setup();
		const current = track('current');
		queueStore.set(GUILD_ID, { current, tracks: [track('next')], previous: [] });
		saved.lastPosition = 25_000;
		saved.lastPositionChange = Date.now();
		saved.paused = true;
		saved.filters.volume = 0.5;
		const restoring = engine.restoreFreshPlayer(node, GUILD_ID, saved, { resetVoiceState: true });
		await vi.advanceTimersByTimeAsync(0);
		expect(updatePlayer).not.toHaveBeenCalled();

		raw.run(voiceState(null));
		voice.channelId = null;
		await vi.advanceTimersByTimeAsync(100);
		await restoring;

		expect(sends.map((send) => send.channelId)).toEqual([null, VOICE_ID]);
		expect(updatePlayer).toHaveBeenCalledWith({
			guildId: GUILD_ID,
			noReplace: false,
			playerOptions: expect.objectContaining({ track: expect.objectContaining({ encoded: current.encoded }), position: 25_100, paused: true })
		});
		expect(manager.getPlayer(GUILD_ID)?.filterManager.data.volume).toBe(0.5);
	});

	it('disconnects the new player even if the cached Discord voice state is already empty', async () => {
		const { voice, sends, restore } = setup();
		voice.channelId = null;
		await restore();
		expect(sends.map((send) => send.channelId)).toEqual([null, VOICE_ID]);
	});

	it('propagates a failed disconnect without reconnecting', async () => {
		const { manager, restore } = setup();
		manager.options.sendToShard = vi.fn(() => {
			throw new Error('shard offline');
		});
		await expect(restore()).rejects.toThrow('shard offline');
		expect(manager.options.sendToShard).toHaveBeenCalledOnce();
	});

	it('keeps automatic reconnect enabled for ordinary disconnects', async () => {
		const { manager, raw, sends } = setup(false);
		manager.createPlayer({ guildId: GUILD_ID, voiceChannelId: VOICE_ID, node: 'main' });
		raw.run(voiceState(null));
		await vi.advanceTimersByTimeAsync(0);
		expect(sends.map((send) => send.channelId)).toEqual([VOICE_ID]);
	});

	it('continues forwarding other members leaving during a voice reset', async () => {
		const { manager, raw, sends } = setup();
		const player = manager.createPlayer({ guildId: GUILD_ID, voiceChannelId: VOICE_ID, node: 'main' });
		player.resettingVoice = true;
		const onLeave = vi.fn();
		manager.on('playerVoiceLeave', onLeave);
		raw.run(voiceState(null, 'other-user'));
		await vi.advanceTimersByTimeAsync(0);
		expect(onLeave).toHaveBeenCalledWith(player, 'other-user');
		expect(sends).toEqual([]);
	});

	it('forwards the new Discord voice handshake after reconnecting', async () => {
		const { manager, raw, updatePlayer } = setup();
		manager.createPlayer({ guildId: GUILD_ID, voiceChannelId: VOICE_ID, node: 'main' });
		await raw.run(voiceState(VOICE_ID));
		await raw.run({
			op: 0,
			s: 2,
			t: GatewayDispatchEvents.VoiceServerUpdate,
			d: { guild_id: GUILD_ID, endpoint: 'voice.example.test', token: 'new-token' }
		});
		expect(updatePlayer).toHaveBeenCalledWith({
			guildId: GUILD_ID,
			playerOptions: { voice: { sessionId: 'discord-session', channelId: VOICE_ID, endpoint: 'voice.example.test', token: 'new-token' } }
		});
	});

	it('recovers an orphan even when its shared node object already has the new session id', async () => {
		const { manager, node, saved, voice, raw, queueStore, updatePlayer } = setup();
		queueStore.set(GUILD_ID, { current: track('current'), tracks: [track('next')], previous: [] });
		const handler = new NodeHandler(manager.nodeManager);
		const orphan = manager.createPlayer({ guildId: GUILD_ID, voiceChannelId: VOICE_ID, node: 'main' });
		vi.spyOn(manager.nodeManager, 'leastUsedNodes').mockReturnValue([]);
		manager.nodeManager.emit('disconnect', node, { code: 1006, reason: 'offline' });
		vi.spyOn(node, 'connected', 'get').mockReturnValue(true);
		node.sessionId = 'new-session';
		const playerSaver = { listGuildIds: async () => [GUILD_ID], get: vi.fn(async () => saved), delete: vi.fn() };
		Object.assign(container, { redisStore: { getPlayerSaver: () => playerSaver } });
		vi.spyOn(handler.sessionRestore, 'isVoiceChannelOccupied').mockResolvedValue(true);

		const restoring = handler.sessionRestore.restoreFreshSession(node);
		await vi.advanceTimersByTimeAsync(0);
		raw.run(voiceState(null));
		voice.channelId = null;
		await vi.advanceTimersByTimeAsync(100);
		await restoring;

		expect(manager.getPlayer(GUILD_ID)).not.toBe(orphan);
		expect(manager.getPlayer(GUILD_ID)?.queue.current?.encoded).toBe('encoded-current');
		expect(updatePlayer).toHaveBeenCalledWith(expect.objectContaining({ playerOptions: expect.objectContaining({ track: expect.any(Object) }) }));
		expect(playerSaver.delete).not.toHaveBeenCalled();
		handler.cleanup();
	});

	it('does not replace a healthy player on a repeated fresh session restore', async () => {
		const { manager, node, saved } = setup();
		const handler = new NodeHandler(manager.nodeManager);
		const player = manager.createPlayer({ guildId: GUILD_ID, voiceChannelId: VOICE_ID, node: 'main' });
		vi.spyOn(node, 'connected', 'get').mockReturnValue(true);
		Object.assign(container, { redisStore: { getPlayerSaver: () => ({ listGuildIds: async () => [GUILD_ID], get: async () => saved }) } });
		await handler.sessionRestore.restoreFreshSession(node);
		expect(manager.getPlayer(GUILD_ID)).toBe(player);
		handler.cleanup();
	});
	it('does not reset voice state on bot restart fresh restore when there is no orphan player', async () => {
		const { manager, node, saved, queueStore, sends } = setup();
		queueStore.set(GUILD_ID, { current: track('current'), tracks: [], previous: [] });
		const handler = new NodeHandler(manager.nodeManager);
		vi.spyOn(node, 'connected', 'get').mockReturnValue(true);
		node.sessionId = 'new-session';
		Object.assign(container, { redisStore: { getPlayerSaver: () => ({ listGuildIds: async () => [GUILD_ID], get: async () => saved }) } });
		vi.spyOn(handler.sessionRestore, 'isVoiceChannelOccupied').mockResolvedValue(true);

		// 봇 재시작 직후: manager.players는 비어 있음 (orphan 없음)
		expect(manager.players.size).toBe(0);

		await handler.sessionRestore.restoreFreshSession(node);

		// 음성 퇴장(null) 전송 없이 바로 음성 채널(VOICE_ID)로 연결한다
		expect(sends.map((s) => s.channelId)).toEqual([VOICE_ID]);
		expect(manager.getPlayer(GUILD_ID)).toBeDefined();
		expect(manager.getPlayer(GUILD_ID)?.voiceChannelId).toBe(VOICE_ID);
		handler.cleanup();
	});

	it.each([true, false])('restores only players whose migration did not succeed (succeeded=%s)', async (migrationSucceeded) => {
		const { manager, node, saved, voice, raw, queueStore, sends } = setup();
		queueStore.set(GUILD_ID, { current: track('current'), tracks: [], previous: [] });
		const handler = new NodeHandler(manager.nodeManager);
		const player = manager.createPlayer({ guildId: GUILD_ID, voiceChannelId: VOICE_ID, node: 'main' });
		const target = manager.nodeManager.createNode({ id: 'other', host: 'localhost', port: 2334, authorization: 'test' });
		if (!target) throw new Error('Missing migration node');
		vi.spyOn(target, 'connected', 'get').mockReturnValue(true);
		vi.spyOn(manager.nodeManager, 'leastUsedNodes').mockReturnValue([target]);
		vi.spyOn(player, 'changeNode').mockImplementation(async () => {
			player.node = target;
			if (!migrationSucceeded) throw new Error('migration failed after switching the node reference');
			return target.id;
		});
		manager.nodeManager.emit('disconnect', node, { code: 1006, reason: 'offline' });
		await vi.advanceTimersByTimeAsync(0);
		vi.spyOn(node, 'connected', 'get').mockReturnValue(true);
		node.sessionId = 'new-session';
		Object.assign(container, { redisStore: { getPlayerSaver: () => ({ listGuildIds: async () => [GUILD_ID], get: async () => saved }) } });
		vi.spyOn(handler.sessionRestore, 'isVoiceChannelOccupied').mockResolvedValue(true);

		const restoring = handler.sessionRestore.restoreFreshSession(node);
		await vi.advanceTimersByTimeAsync(0);
		if (!migrationSucceeded) {
			await raw.run(voiceState(null));
			voice.channelId = null;
			await vi.advanceTimersByTimeAsync(100);
		}
		await restoring;

		if (migrationSucceeded) {
			expect(manager.getPlayer(GUILD_ID)).toBe(player);
			expect(sends).toEqual([]);
		} else {
			expect(manager.getPlayer(GUILD_ID)).not.toBe(player);
			expect(manager.getPlayer(GUILD_ID)?.node).toBe(node);
			expect(sends.at(-1)?.channelId).toBe(VOICE_ID);
		}
		handler.cleanup();
	});
});
