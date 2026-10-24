import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Guild } from '@sirubot/prisma';
import { GuildService, isChannelToggleEnabled, isTtsEnabled } from './guildService.ts';

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock('@sapphire/framework', () => ({ container: { db: { guild: { upsert } } } }));
vi.mock('@sirubot/utils', async () => {
	const { MemoryCache } = await import('../../../../packages/utils/src/memoryCache.ts');
	const { normalizeCustomCommandPrefix } = await import('../../../../packages/utils/src/customCommand.ts');
	// vitest vi.mock 팩토리는 호이스팅되므로 동적 import가 필요해요
	const { normalizeChatToolMode, normalizeEmbedFixSites, normalizeEmbedFixTranslateLang } =
		await import('../../../../packages/utils/src/chatTools.ts');
	return { MemoryCache, normalizeCustomCommandPrefix, normalizeChatToolMode, normalizeEmbedFixSites, normalizeEmbedFixTranslateLang };
});

function guild(id = 'guild', volume = 10): Guild {
	return { id, volume, repeat: 'off', djRoleId: null } as Guild;
}

describe('GuildService concurrent reads', () => {
	beforeEach(() => {
		upsert.mockReset();
	});

	it('shares a cold lookup across concurrent commands and then uses the cache', async () => {
		const row = guild();
		upsert.mockResolvedValue(row);
		const service = new GuildService();
		const result = await Promise.all([service.getGuild('guild'), service.getVolume('guild'), service.getRepeat('guild')]);
		expect(result).toEqual([row, 10, 'off']);
		expect(upsert).toHaveBeenCalledTimes(1);
		expect(await service.getGuild('guild')).toBe(row);
		expect(upsert).toHaveBeenCalledTimes(1);
	});

	it('does not share reads between different guilds', async () => {
		upsert.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(guild(where.id)));
		const service = new GuildService();
		const result = await Promise.all([service.getGuild('one'), service.getGuild('two')]);
		expect(result.map((row) => row.id)).toEqual(['one', 'two']);
		expect(upsert).toHaveBeenCalledTimes(2);
	});

	it('allows a new lookup after a shared lookup fails', async () => {
		upsert.mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue(guild());
		const service = new GuildService();
		const results = await Promise.allSettled([service.getGuild('guild'), service.getGuild('guild')]);
		expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
		expect(upsert).toHaveBeenCalledTimes(1);
		expect(await service.getVolume('guild')).toBe(10);
		expect(upsert).toHaveBeenCalledTimes(2);
	});

	it('keeps a setter result when an older read completes later', async () => {
		let finishRead!: (row: Guild) => void;
		upsert.mockReturnValueOnce(new Promise<Guild>((resolve) => (finishRead = resolve))).mockResolvedValueOnce(guild('guild', 25));
		const service = new GuildService();
		const pending = service.getGuild('guild');
		await service.updateVolume('guild', 25);
		finishRead(guild('guild', 10));
		expect((await pending).volume).toBe(25);
		expect(await service.getVolume('guild')).toBe(25);
		expect(upsert).toHaveBeenCalledTimes(2);
	});
});

describe('GuildService invalidation', () => {
	beforeEach(() => {
		upsert.mockReset();
	});

	it('invalidates cached guild so the next get re-reads from DB', async () => {
		upsert.mockResolvedValue(guild());
		const service = new GuildService();
		await service.getGuild('guild'); // 캐시 웜 (read 1)
		service.invalidate('guild');
		await service.getGuild('guild'); // 캐시 미스 → read 2
		expect(upsert).toHaveBeenCalledTimes(2);
	});

	it('does not re-seed stale value from an in-flight read that started before invalidation', async () => {
		// 조회 시작 → DB 응답 전에 무효화 → 완료된 조회 결과는 캐시에 심지 않아야 해요.
		let finishRead!: (row: Guild) => void;
		upsert.mockReturnValueOnce(new Promise<Guild>((resolve) => (finishRead = resolve))).mockResolvedValueOnce(guild('guild', 30));
		const service = new GuildService();
		const pending = service.getGuild('guild'); // 무효화 이전 read 시작
		service.invalidate('guild'); // DB 응답 도착 전 무효화
		finishRead(guild('guild', 10)); // stale 값 도착
		await pending;
		expect(upsert).toHaveBeenCalledTimes(1);
		// 다음 조회는 무효화 이후 시작된 새 read — 최신 값을 읽어요
		const fresh = await service.getGuild('guild');
		expect(fresh.volume).toBe(30);
		expect(upsert).toHaveBeenCalledTimes(2);
	});

	it('does not re-seed stale when a later getGuild shares an in-flight read that predates invalidation', async () => {
		// 무효화 이후 시작한 getGuild도 pendingReads 공유로 무효화 이전 read 결과를 받지만,
		// 그 결과가 캐시에 심기지 않아 다음 조회는 DB에서 다시 읽어야 해요.
		let finishRead!: (row: Guild) => void;
		upsert.mockReturnValueOnce(new Promise<Guild>((resolve) => (finishRead = resolve))).mockResolvedValueOnce(guild('guild', 30));
		const service = new GuildService();
		const pendingA = service.getGuild('guild'); // 무효화 이전 read 시작
		service.invalidate('guild');
		const sharedPromise = service.getGuild('guild'); // pendingReads 공유 (새 read 아님)
		finishRead(guild('guild', 10));
		const [pendingResult, shared] = await Promise.all([pendingA, sharedPromise]);
		expect(pendingResult).toBe(shared);
		expect(upsert).toHaveBeenCalledTimes(1);
		// 다음 조회는 세대가 일치하는 새 read → 캐시 심기
		await service.getGuild('guild');
		await service.getGuild('guild'); // 캐시 히트
		expect(upsert).toHaveBeenCalledTimes(2);
	});

	it('caches the result of a read started after invalidation', async () => {
		upsert.mockResolvedValue(guild('guild', 20));
		const service = new GuildService();
		await service.getGuild('guild');
		service.invalidate('guild');
		await service.getGuild('guild'); // 무효화 이후 시작 → 캐시 심기 정상
		await service.getGuild('guild'); // 캐시 히트
		expect(upsert).toHaveBeenCalledTimes(2);
	});
});

describe('GuildService TTS settings', () => {
	beforeEach(() => {
		upsert.mockReset();
	});

	it('reads ttsMode/ttsChannelIds and falls back to off when the stored mode is invalid', async () => {
		upsert.mockResolvedValueOnce({ ...guild(), ttsMode: 'channels', ttsChannelIds: ['chan'] } as Guild);
		const service = new GuildService();
		await expect(service.getTtsSettings('guild')).resolves.toEqual({ mode: 'channels', channelIds: ['chan'] });

		upsert.mockResolvedValueOnce({ ...guild(), ttsMode: 'bogus', ttsChannelIds: [] } as Guild);
		await expect(service.getTtsSettings('guild2')).resolves.toEqual({ mode: 'off', channelIds: [] });
	});

	it('allows reading only for enabled policies', () => {
		expect(isTtsEnabled({ mode: 'off', channelIds: ['chan'] }, 'chan')).toBe(false);
		expect(isTtsEnabled({ mode: 'all', channelIds: [] }, 'chan')).toBe(true);
		expect(isTtsEnabled({ mode: 'channels', channelIds: ['chan'] }, 'chan')).toBe(true);
		expect(isTtsEnabled({ mode: 'channels', channelIds: ['chan'] }, 'other')).toBe(false);
		expect(isTtsEnabled({ mode: 'channels', channelIds: [] }, 'chan')).toBe(false);
	});
});

describe('GuildService.setChannelTtsEnabled (채널 낭독 토글)', () => {
	beforeEach(() => {
		upsert.mockReset();
	});

	/**
	 * 읽기(현재 설정 조회) → 쓰기(토글 반영) 순서로 upsert가 두 번 호출돼요.
	 * 첫 번째는 현재 상태, 두 번째는 반영 결과를 반환하게 해요.
	 */
	function seed(read: Guild, written: Guild) {
		upsert.mockResolvedValueOnce(read).mockResolvedValueOnce(written);
	}

	it('켜기: off → channels + [채널]', async () => {
		seed({ ...guild(), ttsMode: 'off', ttsChannelIds: [] } as Guild, { ...guild(), ttsMode: 'channels', ttsChannelIds: ['chan'] } as Guild);
		const service = new GuildService();
		const result = await service.setChannelTtsEnabled('guild', 'chan', true, []);
		expect(result).toEqual({ mode: 'channels', channelIds: ['chan'] });
		expect(upsert.mock.calls[1][0].update).toEqual({ ttsMode: 'channels', ttsChannelIds: ['chan'] });
	});

	it('켜기: channels → 목록에 추가(중복 없음)', async () => {
		seed(
			{ ...guild(), ttsMode: 'channels', ttsChannelIds: ['a', 'b'] } as Guild,
			{
				...guild(),
				ttsMode: 'channels',
				ttsChannelIds: ['a', 'b', 'c']
			} as Guild
		);
		const service = new GuildService();
		const result = await service.setChannelTtsEnabled('guild', 'c', true, []);
		expect(result).toEqual({ mode: 'channels', channelIds: ['a', 'b', 'c'] });
	});

	it('켜기: all이면 그대로 (이미 전체 허용)', async () => {
		seed({ ...guild(), ttsMode: 'all', ttsChannelIds: [] } as Guild, { ...guild(), ttsMode: 'all', ttsChannelIds: [] } as Guild);
		const service = new GuildService();
		const result = await service.setChannelTtsEnabled('guild', 'chan', true, []);
		expect(result).toEqual({ mode: 'all', channelIds: [] });
		expect(upsert.mock.calls[1][0].update).toEqual({ ttsMode: 'all', ttsChannelIds: [] });
	});

	it('끄기: channels → 목록에서 제거', async () => {
		seed(
			{ ...guild(), ttsMode: 'channels', ttsChannelIds: ['a', 'b'] } as Guild,
			{
				...guild(),
				ttsMode: 'channels',
				ttsChannelIds: ['b']
			} as Guild
		);
		const service = new GuildService();
		const result = await service.setChannelTtsEnabled('guild', 'a', false, []);
		expect(result).toEqual({ mode: 'channels', channelIds: ['b'] });
		expect(upsert.mock.calls[1][0].update).toEqual({ ttsMode: 'channels', ttsChannelIds: ['b'] });
	});

	it('끄기: 목록이 비면 off', async () => {
		seed({ ...guild(), ttsMode: 'channels', ttsChannelIds: ['a'] } as Guild, { ...guild(), ttsMode: 'off', ttsChannelIds: [] } as Guild);
		const service = new GuildService();
		const result = await service.setChannelTtsEnabled('guild', 'a', false, []);
		expect(result).toEqual({ mode: 'off', channelIds: [] });
		expect(upsert.mock.calls[1][0].update).toEqual({ ttsMode: 'off', ttsChannelIds: [] });
	});

	it('끄기: all → 나머지 텍스트 채널을 목록으로 승계', async () => {
		seed(
			{ ...guild(), ttsMode: 'all', ttsChannelIds: [] } as Guild,
			{
				...guild(),
				ttsMode: 'channels',
				ttsChannelIds: ['a', 'c']
			} as Guild
		);
		const service = new GuildService();
		const result = await service.setChannelTtsEnabled('guild', 'b', false, ['a', 'b', 'c']);
		expect(result).toEqual({ mode: 'channels', channelIds: ['a', 'c'] });
		expect(upsert.mock.calls[1][0].update).toEqual({ ttsMode: 'channels', ttsChannelIds: ['a', 'c'] });
	});

	it('끄기: all인데 남는 채널이 없으면 off', async () => {
		seed({ ...guild(), ttsMode: 'all', ttsChannelIds: [] } as Guild, { ...guild(), ttsMode: 'off', ttsChannelIds: [] } as Guild);
		const service = new GuildService();
		const result = await service.setChannelTtsEnabled('guild', 'a', false, ['a']);
		expect(result).toEqual({ mode: 'off', channelIds: [] });
	});

	it('AI 채팅 채널 토글도 같은 규칙을 공유한다 (computeChannelToggle)', async () => {
		seed(
			{ ...guild(), aiMode: 'off', aiChannelIds: [] } as Guild,
			{
				...guild(),
				aiMode: 'channels',
				aiChannelIds: ['chan']
			} as Guild
		);
		const service = new GuildService();
		const result = await service.setChannelAiEnabled('guild', 'chan', true, []);
		expect(result).toEqual({ mode: 'channels', channelIds: ['chan'] });
		expect(upsert.mock.calls[1][0].update).toEqual({ aiMode: 'channels', aiChannelIds: ['chan'] });
	});
});

describe('GuildService chat tools (채팅 유틸)', () => {
	beforeEach(() => {
		upsert.mockReset();
	});

	function seed(read: Guild, written: Guild) {
		upsert.mockResolvedValueOnce(read).mockResolvedValueOnce(written);
	}

	it('getChatToolSettings: 저장된 모드·채널 목록을 그대로 읽어요', async () => {
		upsert.mockResolvedValueOnce({
			...guild(),
			emojiEnlargeMode: 'channels',
			emojiEnlargeChannelIds: ['a'],
			quoteMode: 'all',
			quoteChannelIds: [],
			embedFixMode: 'bogus',
			embedFixChannelIds: [],
			embedFixSites: ['x', 'x', 'unknown'],
			embedFixSuppressOriginal: true,
			embedFixTranslateLang: 'ko',
			countingEnabled: true,
			countingChannelId: 'c'
		} as Guild);
		const service = new GuildService();
		await expect(service.getChatToolSettings('guild')).resolves.toEqual({
			emojiEnlarge: { mode: 'channels', channelIds: ['a'] },
			quote: { mode: 'all', channelIds: [] },
			embedFix: { mode: 'off', channelIds: [] },
			embedFixSites: ['x'],
			embedFixSuppressOriginal: true,
			embedFixTranslateLang: 'ko',
			countingEnabled: true,
			countingChannelId: 'c'
		});
	});

	it('isChannelToggleEnabled: off/all/channels 규칙', () => {
		expect(isChannelToggleEnabled({ mode: 'off', channelIds: ['a'] }, 'a')).toBe(false);
		expect(isChannelToggleEnabled({ mode: 'all', channelIds: [] }, 'a')).toBe(true);
		expect(isChannelToggleEnabled({ mode: 'channels', channelIds: ['a'] }, 'a')).toBe(true);
		expect(isChannelToggleEnabled({ mode: 'channels', channelIds: ['a'] }, 'b')).toBe(false);
	});

	it('setChannelChatToolEnabled: 이모지 확대 켜기 off → channels + [채널]', async () => {
		seed(
			{ ...guild(), emojiEnlargeMode: 'off', emojiEnlargeChannelIds: [] } as Guild,
			{ ...guild(), emojiEnlargeMode: 'channels', emojiEnlargeChannelIds: ['chan'] } as Guild
		);
		const service = new GuildService();
		const result = await service.setChannelChatToolEnabled('guild', 'emojiEnlarge', 'chan', true, []);
		expect(result).toEqual({ mode: 'channels', channelIds: ['chan'] });
		expect(upsert.mock.calls[1][0].update).toEqual({ emojiEnlargeMode: 'channels', emojiEnlargeChannelIds: ['chan'] });
	});

	it('setChannelChatToolEnabled: 인용 끄기 목록이 비면 off', async () => {
		seed({ ...guild(), quoteMode: 'channels', quoteChannelIds: ['a'] } as Guild, { ...guild(), quoteMode: 'off', quoteChannelIds: [] } as Guild);
		const service = new GuildService();
		const result = await service.setChannelChatToolEnabled('guild', 'quote', 'a', false, []);
		expect(result).toEqual({ mode: 'off', channelIds: [] });
		expect(upsert.mock.calls[1][0].update).toEqual({ quoteMode: 'off', quoteChannelIds: [] });
	});

	it('setChannelChatToolEnabled: 임베드 복구 끄기 all → 나머지 채널 승계', async () => {
		seed(
			{ ...guild(), embedFixMode: 'all', embedFixChannelIds: [] } as Guild,
			{ ...guild(), embedFixMode: 'channels', embedFixChannelIds: ['a', 'c'] } as Guild
		);
		const service = new GuildService();
		const result = await service.setChannelChatToolEnabled('guild', 'embedFix', 'b', false, ['a', 'b', 'c']);
		expect(result).toEqual({ mode: 'channels', channelIds: ['a', 'c'] });
		expect(upsert.mock.calls[1][0].update).toEqual({ embedFixMode: 'channels', embedFixChannelIds: ['a', 'c'] });
	});

	it('setCountingChannel: 지정하면 켜지고 null을 넘기면 꺼요', async () => {
		upsert.mockResolvedValueOnce({ ...guild(), countingEnabled: true, countingChannelId: 'chan' } as Guild);
		const service = new GuildService();
		await expect(service.setCountingChannel('guild', 'chan')).resolves.toEqual({ countingEnabled: true, countingChannelId: 'chan' });
		expect(upsert.mock.calls[0][0].update).toEqual({ countingChannelId: 'chan', countingEnabled: true });

		upsert.mockReset();
		upsert.mockResolvedValueOnce({ ...guild(), countingEnabled: false, countingChannelId: null } as Guild);
		await expect(service.setCountingChannel('guild', null)).resolves.toEqual({ countingEnabled: false, countingChannelId: null });
		expect(upsert.mock.calls[0][0].update).toEqual({ countingChannelId: null, countingEnabled: false });
	});

	it('setCountingEnabled: on/off만 바꿔요', async () => {
		upsert.mockResolvedValueOnce({ ...guild(), countingEnabled: true, countingChannelId: 'chan' } as Guild);
		const service = new GuildService();
		await expect(service.setCountingEnabled('guild', true)).resolves.toBe(true);
		expect(upsert.mock.calls[0][0].update).toEqual({ countingEnabled: true });
	});
});
