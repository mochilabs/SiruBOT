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

import { getJtcSettings, setJtcCategory, setJtcEnabled, setJtcTemplate, setJtcUserLimit } from './jtc.ts';
import { GuildSettingsStore } from './store.ts';

function guild(id = 'guild', overrides: Partial<Guild> = {}): Guild {
	return {
		id,
		jtcEnabled: false,
		jtcCategoryId: null,
		jtcMarkerChannelId: null,
		jtcTemplate: '',
		jtcUserLimit: 0,
		...overrides
	} as Guild;
}

describe('jtc 도메인 CRUD', () => {
	beforeEach(() => {
		upsert.mockReset();
	});

	it('JTC 셋팅 5필드를 한 번에 읽어요', async () => {
		upsert.mockResolvedValueOnce(
			guild('guild', { jtcEnabled: true, jtcCategoryId: 'cat-1', jtcMarkerChannelId: 'mark-1', jtcTemplate: '{user}의 방', jtcUserLimit: 3 })
		);
		const store = new GuildSettingsStore();
		await expect(getJtcSettings(store, 'guild')).resolves.toEqual({
			enabled: true,
			categoryId: 'cat-1',
			markerChannelId: 'mark-1',
			template: '{user}의 방',
			userLimit: 3
		});
	});

	it('setJtcEnabled·setJtcTemplate는 단일 필드로 저장해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { jtcEnabled: true }));
		const store = new GuildSettingsStore();
		await expect(setJtcEnabled(store, 'guild', true)).resolves.toBe(true);
		expect(upsert.mock.calls[0][0].update).toEqual({ jtcEnabled: true });

		upsert.mockResolvedValueOnce(guild('guild', { jtcTemplate: '{user}의 방' }));
		await expect(setJtcTemplate(store, 'guild', '{user}의 방')).resolves.toBe('{user}의 방');
		expect(upsert.mock.calls[1][0].update).toEqual({ jtcTemplate: '{user}의 방' });
	});

	it('setJtcCategory는 카테고리·마커 채널을 한 번에 저장해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { jtcCategoryId: 'cat-1', jtcMarkerChannelId: 'mark-1' }));
		const store = new GuildSettingsStore();
		await expect(setJtcCategory(store, 'guild', 'cat-1', 'mark-1')).resolves.toMatchObject({
			jtcCategoryId: 'cat-1',
			jtcMarkerChannelId: 'mark-1'
		});
		expect(upsert.mock.calls[0][0].update).toEqual({ jtcCategoryId: 'cat-1', jtcMarkerChannelId: 'mark-1' });
		expect(upsert.mock.calls[0][0].create).toEqual({ id: 'guild', jtcCategoryId: 'cat-1', jtcMarkerChannelId: 'mark-1' });
	});

	it('setJtcUserLimit은 0~99 사이로 클램프해요', async () => {
		const store = new GuildSettingsStore();

		upsert.mockResolvedValueOnce(guild('guild', { jtcUserLimit: 99 }));
		await expect(setJtcUserLimit(store, 'guild', 150)).resolves.toBe(99);
		expect(upsert.mock.calls[0][0].update).toEqual({ jtcUserLimit: 99 });

		upsert.mockResolvedValueOnce(guild('guild', { jtcUserLimit: 0 }));
		await expect(setJtcUserLimit(store, 'guild', -5)).resolves.toBe(0);
		expect(upsert.mock.calls[1][0].update).toEqual({ jtcUserLimit: 0 });

		upsert.mockResolvedValueOnce(guild('guild', { jtcUserLimit: 12 }));
		await expect(setJtcUserLimit(store, 'guild', 12.7)).resolves.toBe(12);
		expect(upsert.mock.calls[2][0].update).toEqual({ jtcUserLimit: 12 });
	});
});
