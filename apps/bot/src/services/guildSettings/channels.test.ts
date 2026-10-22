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

import {
	getDefaultTextChannel,
	getPinnedChannel,
	getPinnedChannelDeleteInput,
	getPinnedChannelMode,
	setDefaultVoiceChannel,
	setPinnedChannel,
	setPinnedChannelDeleteInput,
	setPinnedChannelMode
} from './channels.ts';
import { GuildSettingsStore } from './store.ts';

function guild(id = 'guild', overrides: Partial<Guild> = {}): Guild {
	return {
		id,
		textChannelId: null,
		voiceChannelId: null,
		pinnedChannelId: null,
		pinnedChannelMode: 'play',
		pinnedChannelDeleteInput: false,
		...overrides
	} as Guild;
}

describe('channels 도메인 CRUD', () => {
	beforeEach(() => {
		upsert.mockReset();
	});

	it('기본 텍스트·음성 채널을 저장하고 읽어요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { voiceChannelId: 'voice-1' }));
		const store = new GuildSettingsStore();
		await expect(setDefaultVoiceChannel(store, 'guild', 'voice-1')).resolves.toBe('voice-1');
		expect(upsert.mock.calls[0][0].update).toEqual({ voiceChannelId: 'voice-1' });

		await expect(getDefaultTextChannel(store, 'guild')).resolves.toBeNull();
		expect(upsert).toHaveBeenCalledTimes(1);
	});

	it('고정 채널 입력 동작은 select만 select로 읽고 그 외는 play로 폴백해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { pinnedChannelMode: 'select' }));
		const store = new GuildSettingsStore();
		await expect(getPinnedChannelMode(store, 'guild')).resolves.toBe('select');

		upsert.mockResolvedValueOnce(guild('guild', { pinnedChannelMode: 'bogus' as never }));
		const broken = new GuildSettingsStore();
		await expect(getPinnedChannelMode(broken, 'guild')).resolves.toBe('play');
	});

	it('고정 채널과 입력 메시지 삭제 여부를 저장해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { pinnedChannelId: 'pin-1' }));
		const store = new GuildSettingsStore();
		await expect(setPinnedChannel(store, 'guild', 'pin-1')).resolves.toBe('pin-1');
		expect(upsert.mock.calls[0][0].update).toEqual({ pinnedChannelId: 'pin-1' });

		upsert.mockResolvedValueOnce(guild('guild', { pinnedChannelDeleteInput: true }));
		await expect(setPinnedChannelDeleteInput(store, 'guild', true)).resolves.toBe(true);
		expect(upsert.mock.calls[1][0].update).toEqual({ pinnedChannelDeleteInput: true });

		await expect(getPinnedChannel(store, 'guild')).resolves.toBeNull();
		await expect(getPinnedChannelDeleteInput(store, 'guild')).resolves.toBe(true);
	});

	it('고정 채널 모드를 저장해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { pinnedChannelMode: 'select' }));
		const store = new GuildSettingsStore();
		await expect(setPinnedChannelMode(store, 'guild', 'select')).resolves.toBe('select');
		expect(upsert.mock.calls[0][0].update).toEqual({ pinnedChannelMode: 'select' });
	});
});
