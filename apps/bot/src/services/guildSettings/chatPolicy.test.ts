import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Guild } from '@sirubot/prisma';

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock('@sapphire/framework', () => ({ container: { db: { guild: { upsert } } } }));
vi.mock('@sirubot/utils', async () => {
	const { MemoryCache } = await import('../../../../../packages/utils/src/memoryCache.ts');
	const { normalizeCustomCommandPrefix } = await import('../../../../../packages/utils/src/customCommand.ts');
	const { normalizeEmbedFixSites } = await import('../../../../../packages/utils/src/chatTools.ts');
	return { MemoryCache, normalizeCustomCommandPrefix, normalizeEmbedFixSites };
});

import { getAiSettings, getCustomCommandPrefix, removeAiChannel, setAiChannelIds } from './chatPolicy.ts';
import { GuildSettingsStore } from './store.ts';

function guild(id = 'guild', overrides: Partial<Guild> = {}): Guild {
	return { id, aiMode: 'off', aiChannelIds: [], customCommandPrefix: null, ...overrides } as Guild;
}

describe('chatPolicy 도메인 CRUD', () => {
	beforeEach(() => {
		upsert.mockReset();
	});

	it('getAiSettings는 깨린 모드를 all로 정규화해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { aiMode: 'bogus', aiChannelIds: ['c1'] }));
		const store = new GuildSettingsStore();
		await expect(getAiSettings(store, 'guild')).resolves.toEqual({ mode: 'all', channelIds: ['c1'] });
	});

	it('getCustomCommandPrefix는 안전한 접두사만 쓰고 나머지는 기본값으로 되돌려요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { customCommandPrefix: '!!' }));
		const store = new GuildSettingsStore();
		await expect(getCustomCommandPrefix(store, 'guild')).resolves.toBe('!!');

		upsert.mockResolvedValueOnce(guild('guild', { customCommandPrefix: '  ' }));
		const broken = new GuildSettingsStore();
		await expect(getCustomCommandPrefix(broken, 'guild')).resolves.toBe('!');
	});

	it('setAiChannelIds는 중복을 제거해 저장해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { aiChannelIds: ['a', 'b'] }));
		const store = new GuildSettingsStore();
		await expect(setAiChannelIds(store, 'guild', ['a', 'b', 'a'])).resolves.toEqual(['a', 'b']);
		expect(upsert.mock.calls[0][0].update).toEqual({ aiChannelIds: ['a', 'b'] });
	});

	it('removeAiChannel은 목록에 없는 채널이면 아무것도 쓰지 않아요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { aiChannelIds: ['a'] }));
		const store = new GuildSettingsStore();
		await removeAiChannel(store, 'guild', 'missing');
		expect(upsert).toHaveBeenCalledTimes(1);
	});

	it('removeAiChannel은 목록에 있으면 제거한 목록으로 저장해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { aiChannelIds: ['a', 'b'] })).mockResolvedValueOnce(guild('guild', { aiChannelIds: ['b'] }));
		const store = new GuildSettingsStore();
		await removeAiChannel(store, 'guild', 'a');
		expect(upsert).toHaveBeenCalledTimes(2);
		expect(upsert.mock.calls[1][0].update).toEqual({ aiChannelIds: ['b'] });
	});
});
