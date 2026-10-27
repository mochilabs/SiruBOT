import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatTtsService, preprocessTtsText, TTS_CLIP_MAX_CHARS, TTS_MERGE_WINDOW_MS, TTS_OVERLAY_QUEUE_MAX, TTS_SOLO_QUEUE_MAX } from './chatTts.ts';
import { TTS_CLIP_REQUESTER_ID } from '../modules/audio/lavalink/requester.ts';
import type { CustomPlayer } from '../modules/audio/lavalink/player/customPlayer.ts';
import type { Message, User } from 'discord.js';
import type { Track } from 'lavalink-client';

const mocks = vi.hoisted(() => ({
	logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
	ttsService: { synthesize: vi.fn() },
	// announce 방식은 길드 설정 3택으로 결정돼요 — clearAnnounceQueue는 interrupt 모드 전용이에요
	mixerService: { getState: vi.fn(), announce: vi.fn(), clearAnnounceQueue: vi.fn() },
	audioService: { ensurePlayback: vi.fn() },
	guildService: { getTtsSettings: vi.fn(), getTtsDuck: vi.fn(), getTtsAnnounceMode: vi.fn() },
	audio: { getPlayer: vi.fn() }
}));

vi.mock('@sapphire/framework', () => ({ container: mocks }));

function ttsTrack(encoded: string, title = 'x'): Track {
	return {
		encoded,
		info: { title, identifier: `https://tts.example/v1/shared/${encoded}` },
		requester: { id: TTS_CLIP_REQUESTER_ID, username: '채팅 TTS' }
	} as unknown as Track;
}

function musicTrack(encoded: string): Track {
	return { encoded, info: { title: '노래' }, requester: { id: 'user-9' } } as unknown as Track;
}

function makePlayer() {
	return {
		guildId: 'guild-1',
		queue: { current: null as unknown, tracks: [] as unknown[], previous: [] as unknown[], add: vi.fn() },
		playing: false,
		search: vi.fn(async () => ({ loadType: 'track', tracks: [ttsTrack('enc-search')] })),
		getData: vi.fn(() => undefined),
		setData: vi.fn(),
		transitionState: {
			confirmedNowPlaying: null,
			stopByCommand: false,
			lastStartedEncoded: null,
			preloadConsumedAt: null,
			serverConsumedTrack: null
		}
	} as unknown as CustomPlayer & {
		queue: { current: unknown; tracks: unknown[]; previous: unknown[]; add: ReturnType<typeof vi.fn> };
		search: ReturnType<typeof vi.fn>;
		getData: ReturnType<typeof vi.fn>;
		setData: ReturnType<typeof vi.fn>;
	};
}

function makeMessage(overrides: { guildId?: string; channelId?: string; userId?: string; content?: string } = {}): Message<true> {
	return {
		guildId: overrides.guildId ?? 'guild-1',
		channelId: overrides.channelId ?? 'channel-1',
		content: overrides.content ?? '안녕하세요',
		author: { id: overrides.userId ?? 'user-1', bot: false } as User,
		mentions: { members: new Map(), users: new Map(), roles: new Map(), channels: new Map() },
		webhookId: null
	} as unknown as Message<true>;
}

function clip(url: string) {
	return { url, expires_in: 600, format: 'wav', cache: 'miss', duration_ms: 100 };
}

/** 비동기 체인(dispatch chain)을 비운다 — fake 타이머 여부에 맞춰 동작한다 */
async function flushAsync(): Promise<void> {
	if (vi.isFakeTimers()) {
		await vi.advanceTimersByTimeAsync(0);
		return;
	}
	await new Promise<void>((resolve) => setImmediate(resolve));
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

const resolvers = { memberName: () => null, roleName: () => null, channelName: () => null };

beforeEach(() => {
	vi.clearAllMocks();
	mocks.mixerService.announce.mockResolvedValue({ guildId: 'guild-1', id: 1, position: 1, queueLength: 1 });
	mocks.mixerService.getState.mockResolvedValue({ announcementsQueued: 0 });
	mocks.audioService.ensurePlayback.mockResolvedValue(undefined);
	mocks.ttsService.synthesize.mockImplementation(async (text: string) =>
		clip(`https://tts.example/v1/shared/${encodeURIComponent(text.slice(0, 8))}`)
	);
	mocks.audio.getPlayer.mockReturnValue(undefined);
	mocks.guildService.getTtsAnnounceMode.mockResolvedValue('sequential');
	mocks.mixerService.clearAnnounceQueue.mockResolvedValue(0);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('preprocessTtsText (명세 4.5 전처리 표)', () => {
	it('collapses newlines and repeated spaces', () => {
		expect(preprocessTtsText('안녕\n\n  하세요   반갑습니다', resolvers)).toBe('안녕 하세요 반갑습니다');
	});

	it('resolves user mentions to the nickname and falls back to 사용자', () => {
		const named = { ...resolvers, memberName: (id: string) => (id === '1' ? '철수' : null) };
		expect(preprocessTtsText('<@1> 안녕 <@!2>', named)).toBe('철수 안녕 사용자');
	});

	it('resolves role mentions and falls back to 역할', () => {
		const named = { ...resolvers, roleName: (id: string) => (id === '1' ? '관리자' : null) };
		expect(preprocessTtsText('<@&1> 분 <@&2> 소', named)).toBe('관리자 분 역할 소');
	});

	it('replaces @everyone and @here with 모두', () => {
		expect(preprocessTtsText('@everyone 다 모여 @here 지금', resolvers)).toBe('모두 다 모여 모두 지금');
	});

	it('keeps custom emoji names only', () => {
		expect(preprocessTtsText('<:party:123>와 <a:wave:456>', resolvers)).toBe('party와 wave');
	});

	it('keeps unicode emoji as-is', () => {
		expect(preprocessTtsText('안녕 👋 반가워 🎵', resolvers)).toBe('안녕 👋 반가워 🎵');
	});

	it('replaces URLs with 링크', () => {
		expect(preprocessTtsText('봐 https://example.com/a?b=1 과 www.example.com 도', resolvers)).toBe('봐 링크 과 링크 도');
	});

	it('strips inline code and code block markers but reads the content', () => {
		expect(preprocessTtsText('`const a` 은\n```\nconst b\n```\n다', resolvers)).toBe('const a 은 const b 다');
	});

	it('strips quote markers but reads the content', () => {
		expect(preprocessTtsText('> 인용문\n>>> 여러 줄 인용', resolvers)).toBe('인용문 여러 줄 인용');
	});

	it('strips spoiler markers but reads the content', () => {
		expect(preprocessTtsText('||스포일러|| 내용', resolvers)).toBe('스포일러 내용');
	});

	it('resolves channel mentions and falls back to 채널', () => {
		const named = { ...resolvers, channelName: (id: string) => (id === '1' ? '일반' : null) };
		expect(preprocessTtsText('<#1> 에서 <#2> 로', named)).toBe('일반 에서 채널 로');
	});

	it('returns empty for whitespace-only input', () => {
		expect(preprocessTtsText('   ', resolvers)).toBe('');
	});
});

describe('ChatTtsService — 병합 창·간격 (명세 4.4)', () => {
	it('synthesizes the first message immediately without a merge delay', async () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		mocks.audio.getPlayer.mockReturnValue(player);

		await service.handleMessage(makeMessage(), '첫 메시지');
		await flushAsync();

		expect(mocks.ttsService.synthesize).toHaveBeenCalledWith('첫 메시지', { voice: undefined, speed: undefined, pitch: undefined });
	});

	it('merges messages arriving inside the 3s window into one clip', async () => {
		vi.useFakeTimers();
		const service = new ChatTtsService();
		const player = makePlayer();
		mocks.audio.getPlayer.mockReturnValue(player);

		await service.handleMessage(makeMessage(), '첫 번째');
		await flushAsync();
		await service.handleMessage(makeMessage(), '두 번째');
		await service.handleMessage(makeMessage(), '세 번째');
		expect(mocks.ttsService.synthesize).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(TTS_MERGE_WINDOW_MS);
		expect(mocks.ttsService.synthesize).toHaveBeenCalledTimes(2);
		expect(mocks.ttsService.synthesize).toHaveBeenLastCalledWith('두 번째 세 번째', { voice: undefined, speed: undefined, pitch: undefined });
	});

	it('passes the user preset through to synthesize (voice/speed/pitch)', async () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		mocks.audio.getPlayer.mockReturnValue(player);

		await service.handleMessage(makeMessage(), '프리셋 적용', { enabled: true, voice: 'edge:ko-KR-YoonNeural', speed: 1.25, pitch: -2 });
		await flushAsync();

		expect(mocks.ttsService.synthesize).toHaveBeenCalledWith('프리셋 적용', { voice: 'edge:ko-KR-YoonNeural', speed: 1.25, pitch: -2 });
	});

	it('carries the preset of the batch-seeding message through a merge batch', async () => {
		vi.useFakeTimers();
		const service = new ChatTtsService();
		const player = makePlayer();
		mocks.audio.getPlayer.mockReturnValue(player);

		// 첫 메시지는 즉시 합성(프리셋 없음) — 두 번째가 병합 창을 여는데, 이때 프리셋이 배치에 저장된다
		await service.handleMessage(makeMessage(), '첫 발화');
		await flushAsync();
		await service.handleMessage(makeMessage(), '배치 시작', { enabled: true, voice: 'melo:KR', speed: null, pitch: null });
		await service.handleMessage(makeMessage(), '이어 말하기');
		await vi.advanceTimersByTimeAsync(TTS_MERGE_WINDOW_MS);

		expect(mocks.ttsService.synthesize).toHaveBeenLastCalledWith('배치 시작 이어 말하기', {
			voice: 'melo:KR',
			speed: undefined,
			pitch: undefined
		});
	});

	it('drops messages arriving after the merge window closed (late input race)', async () => {
		vi.useFakeTimers();
		const service = new ChatTtsService();
		const player = makePlayer();
		mocks.audio.getPlayer.mockReturnValue(player);

		await service.handleMessage(makeMessage(), '첫 메시지');
		await flushAsync();
		await service.handleMessage(makeMessage(), '배치 시작');
		// flush 타이머를 돌리지 않고 시계만 앞으로 넘긴다 — 배치가 열려 있는데 창이 지난 상태
		vi.setSystemTime(Date.now() + TTS_MERGE_WINDOW_MS + 1000);

		await service.handleMessage(makeMessage(), '창 밖 입력');
		await flushAsync();

		expect(mocks.ttsService.synthesize).toHaveBeenCalledTimes(1);
		expect(mocks.logger.warn).toHaveBeenCalled();
	});

	it('truncates clips to 300 characters', async () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		mocks.audio.getPlayer.mockReturnValue(player);

		await service.handleMessage(makeMessage(), '글자'.repeat(250));
		await flushAsync();

		const text = mocks.ttsService.synthesize.mock.calls[0][0] as string;
		expect(text).toHaveLength(TTS_CLIP_MAX_CHARS);
	});
});

describe('ChatTtsService — 모드 결정 (명세 4.2)', () => {
	it('overlays via mixer announce when music is playing', async () => {
		mocks.guildService.getTtsDuck.mockResolvedValue(0.35);
		const service = new ChatTtsService();
		const player = makePlayer();
		player.queue.current = musicTrack('music');
		mocks.audio.getPlayer.mockReturnValue(player);

		await service.handleMessage(makeMessage(), '읽어줘');
		await flushAsync();

		expect(mocks.mixerService.announce).toHaveBeenCalledWith(player, expect.stringContaining('https://tts.example'), 0.35, 'sequential');
		expect(mocks.guildService.getTtsDuck).toHaveBeenCalledWith('guild-1');
		expect(player.search).not.toHaveBeenCalled();
	});

	it('rejects overlay clips when too many announcements are queued', async () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		player.queue.current = musicTrack('music');
		mocks.audio.getPlayer.mockReturnValue(player);
		mocks.mixerService.getState.mockResolvedValue({ announcementsQueued: TTS_OVERLAY_QUEUE_MAX + 1 });

		await service.handleMessage(makeMessage(), '읽어줘');
		await flushAsync();

		expect(mocks.mixerService.announce).not.toHaveBeenCalled();
		expect(mocks.logger.warn).toHaveBeenCalled();
	});

	it('still announces when mixer state lookup fails', async () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		player.queue.current = musicTrack('music');
		mocks.audio.getPlayer.mockReturnValue(player);
		mocks.mixerService.getState.mockRejectedValue(new Error('boom'));

		await service.handleMessage(makeMessage(), '읽어줘');
		await flushAsync();

		expect(mocks.mixerService.announce).toHaveBeenCalled();
	});

	it('plays the clip as a main-player track when no music is playing', async () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		mocks.audio.getPlayer.mockReturnValue(player);

		await service.handleMessage(makeMessage(), '노래 없이 읽기');
		await flushAsync();

		expect(player.search).toHaveBeenCalledWith(
			{ query: expect.stringContaining('https://tts.example') },
			{ id: TTS_CLIP_REQUESTER_ID, username: '채팅 TTS' }
		);
		expect(mocks.audioService.ensurePlayback).toHaveBeenCalledWith(player);
		expect(mocks.mixerService.announce).not.toHaveBeenCalled();
		expect(player.queue.add.mock.calls[0][0].info.title).toBe('TTS: 노래 없이 읽기');
	});

	it('titles solo clips with the first 20 chars of the message', async () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		mocks.audio.getPlayer.mockReturnValue(player);

		await service.handleMessage(makeMessage(), '012345678901234567890123456789');
		await flushAsync();

		expect(player.queue.add.mock.calls[0][0].info.title).toBe('TTS: 01234567890123456789');
	});

	it('queues solo clips while a TTS clip is active and drops the oldest beyond 5', async () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		player.queue.current = ttsTrack('enc-playing');
		mocks.audio.getPlayer.mockReturnValue(player);

		for (let i = 0; i < TTS_SOLO_QUEUE_MAX + 2; i++) {
			await service.handleMessage(makeMessage({ userId: `user-${i}` }), `클립 ${i}`);
			await flushAsync();
		}

		expect(player.search).not.toHaveBeenCalled();
		expect(await service.seedNextSoloClip(player)).toBe(true);
		// 상한을 넘긴 앞의 두 클립(0, 1)은 버려진다
		expect(player.queue.add.mock.calls[0][0].info.title).toBe('TTS: 클립 2');
	});
});

describe('ChatTtsService — 스로틀·주문 (명세 4.4)', () => {
	it('drops clips over the guild per-minute character budget', async () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		mocks.audio.getPlayer.mockReturnValue(player);

		const long = '가'.repeat(TTS_CLIP_MAX_CHARS);
		for (let i = 0; i < 5; i++) {
			await service.handleMessage(makeMessage({ userId: `user-${i}` }), long);
			await flushAsync();
		}

		// 300자 * 4 = 1200 > 1000 — 4번째부터 버려진다
		expect(mocks.ttsService.synthesize).toHaveBeenCalledTimes(3);
		expect(mocks.logger.warn).toHaveBeenCalled();
	});

	it('dispatches clips in message order even when synthesis finishes out of order', async () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		player.queue.current = musicTrack('music');
		mocks.audio.getPlayer.mockReturnValue(player);

		const first = deferred<ReturnType<typeof clip>>();
		const second = deferred<ReturnType<typeof clip>>();
		mocks.ttsService.synthesize.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

		await service.handleMessage(makeMessage({ userId: 'user-a' }), '첫째');
		await flushAsync();
		await service.handleMessage(makeMessage({ userId: 'user-b' }), '둘째');
		await flushAsync();

		second.resolve(clip('https://tts.example/v1/shared/second'));
		await flushAsync();
		first.resolve(clip('https://tts.example/v1/shared/first'));
		await flushAsync();

		expect(mocks.mixerService.announce.mock.calls.map((call) => call[1])).toEqual([
			'https://tts.example/v1/shared/first',
			'https://tts.example/v1/shared/second'
		]);
	});

	it('runs at most 2 syntheses concurrently per guild', async () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		mocks.audio.getPlayer.mockReturnValue(player);

		const gates = [deferred<ReturnType<typeof clip>>(), deferred<ReturnType<typeof clip>>(), deferred<ReturnType<typeof clip>>()];
		let call = 0;
		mocks.ttsService.synthesize.mockImplementation(() => gates[call++].promise);

		for (const userId of ['user-a', 'user-b', 'user-c']) {
			await service.handleMessage(makeMessage({ userId }), '동시 합성');
			await flushAsync();
		}
		expect(mocks.ttsService.synthesize).toHaveBeenCalledTimes(2);

		gates[0].resolve(clip('https://tts.example/v1/shared/1'));
		await flushAsync();
		expect(mocks.ttsService.synthesize).toHaveBeenCalledTimes(3);
	});

	it('silently drops the clip when synthesis fails', async () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		mocks.audio.getPlayer.mockReturnValue(player);
		mocks.ttsService.synthesize.mockRejectedValue(new Error('quota'));

		await expect(service.handleMessage(makeMessage(), '실패')).resolves.toBeUndefined();
		await flushAsync();

		expect(mocks.mixerService.announce).not.toHaveBeenCalled();
		expect(player.search).not.toHaveBeenCalled();
	});
});

describe('ChatTtsService — 단독 큐 drain·scrub·keep-alive', () => {
	it('drains remaining solo clips to overlay announces in order when music starts', async () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		player.queue.current = ttsTrack('enc-playing');
		mocks.audio.getPlayer.mockReturnValue(player);

		await service.handleMessage(makeMessage({ userId: 'user-a' }), '하나');
		await flushAsync();
		await service.handleMessage(makeMessage({ userId: 'user-b' }), '둘');
		await flushAsync();

		await service.drainSoloQueueToAnnounce(player);
		expect(mocks.mixerService.announce.mock.calls.map((call) => call[1])).toEqual([
			expect.stringContaining('%ED%95%98%EB%82%98'),
			expect.stringContaining('%EB%91%98')
		]);
	});

	it('seeds the next solo clip into the queue and skips unresolvable clips', async () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		player.queue.current = ttsTrack('enc-playing');
		mocks.audio.getPlayer.mockReturnValue(player);

		await service.handleMessage(makeMessage({ userId: 'user-a' }), '깨지는 클립');
		await flushAsync();
		await service.handleMessage(makeMessage({ userId: 'user-b' }), '살아남는 클립');
		await flushAsync();

		player.queue.current = null;
		player.search.mockRejectedValueOnce(new Error('resolve failed')).mockResolvedValueOnce({ loadType: 'track', tracks: [ttsTrack('enc-ok')] });

		expect(await service.seedNextSoloClip(player)).toBe(true);
		expect(player.queue.add).toHaveBeenCalledWith(expect.objectContaining({ encoded: 'enc-ok' }));
		expect(await service.seedNextSoloClip(player)).toBe(false);
	});

	it('scrubs TTS leftovers and promotes the next track when current ended', () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		const ended = ttsTrack('enc-ended');
		const nextMusic = musicTrack('music');
		player.queue.current = ended;
		player.queue.tracks = [ttsTrack('enc-repeat-leftover'), nextMusic];
		player.queue.previous = [ttsTrack('enc-prev')];

		service.scrubTtsClips(player, ended);

		// 잔재는 제거되고, 끝난 current의 다음 트랙이 current로 승격된다
		expect(player.queue.tracks).toEqual([]);
		expect(player.queue.current).toBe(nextMusic);
		expect(player.queue.previous).toEqual([]);
	});

	it('keeps current when a duplicate event arrives after the next clip started', () => {
		const service = new ChatTtsService();
		const player = makePlayer();
		const nextClip = ttsTrack('enc-next');
		player.queue.current = nextClip;

		service.scrubTtsClips(player, ttsTrack('enc-ended'));

		expect(player.queue.current).toBe(nextClip);
	});

	it('detects TTS ends by event track or confirmed now-playing', () => {
		const service = new ChatTtsService();
		const player = makePlayer();

		expect(service.isTtsEnded(player, ttsTrack('enc-a'))).toBe(true);
		expect(service.isTtsEnded(player, musicTrack('music'))).toBe(false);
		player.transitionState.confirmedNowPlaying = ttsTrack('enc-b');
		expect(service.isTtsEnded(player, null)).toBe(true);
	});

	it('cancels the idle destroy timer when TTS is enabled for the guild', async () => {
		process.env.SIRU_TTS_URL = 'http://tts.invalid';
		process.env.SIRU_TTS_API_KEY = 'key';
		process.env.SIRU_TTS_DEFAULT_VOICE = 'edge:ko-KR-SunHiNeural';
		try {
			const service = new ChatTtsService();
			const player = makePlayer();
			const handle = setTimeout(() => null, 10_000);
			player.getData.mockReturnValue(handle);
			mocks.guildService.getTtsSettings.mockResolvedValue({ mode: 'all', channelIds: [] });

			await service.keepAliveForTts(player);

			expect(player.setData).toHaveBeenCalledWith('internal_queueempty', undefined);
			clearTimeout(handle);
		} finally {
			delete process.env.SIRU_TTS_URL;
			delete process.env.SIRU_TTS_API_KEY;
			delete process.env.SIRU_TTS_DEFAULT_VOICE;
		}
	});

	it('does not touch the idle timer when TTS is off for the guild', async () => {
		process.env.SIRU_TTS_URL = 'http://tts.invalid';
		process.env.SIRU_TTS_API_KEY = 'key';
		process.env.SIRU_TTS_DEFAULT_VOICE = 'edge:ko-KR-SunHiNeural';
		try {
			const service = new ChatTtsService();
			const player = makePlayer();
			mocks.guildService.getTtsSettings.mockResolvedValue({ mode: 'off', channelIds: [] });

			await service.keepAliveForTts(player);

			expect(player.setData).not.toHaveBeenCalled();
		} finally {
			delete process.env.SIRU_TTS_URL;
			delete process.env.SIRU_TTS_API_KEY;
			delete process.env.SIRU_TTS_DEFAULT_VOICE;
		}
	});
});
