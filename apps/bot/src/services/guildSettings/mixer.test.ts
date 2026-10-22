import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Guild } from '@sirubot/prisma';

const { upsert, update } = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn() }));

vi.mock('@sapphire/framework', () => ({ container: { db: { guild: { upsert, update } } } }));
vi.mock('@sirubot/utils', async () => {
	const { MemoryCache } = await import('../../../../../packages/utils/src/memoryCache.ts');
	const { normalizeCustomCommandPrefix } = await import('../../../../../packages/utils/src/customCommand.ts');
	const { normalizeEmbedFixSites } = await import('../../../../../packages/utils/src/chatTools.ts');
	return { MemoryCache, normalizeCustomCommandPrefix, normalizeEmbedFixSites };
});

import { getMixerSettings, setCrossfade, setGapless } from './mixer.ts';
import { GuildSettingsStore } from './store.ts';

function guild(id = 'guild', overrides: Partial<Guild> = {}): Guild {
	return { id, gaplessEnabled: false, crossfadeEnabled: false, crossfadeMs: 1000, ...overrides } as Guild;
}

describe('mixer 도메인 CRUD', () => {
	beforeEach(() => {
		upsert.mockReset();
		update.mockReset();
	});

	it('갭리스·크로스페이드 설정을 한 번에 읽어요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { gaplessEnabled: true, crossfadeEnabled: true, crossfadeMs: 2500 }));
		const store = new GuildSettingsStore();
		await expect(getMixerSettings(store, 'guild')).resolves.toEqual({ gaplessEnabled: true, crossfadeEnabled: true, crossfadeMs: 2500 });
	});

	it('setGapless는 단일 필드로 저장해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { gaplessEnabled: true }));
		const store = new GuildSettingsStore();
		await expect(setGapless(store, 'guild', true)).resolves.toBe(true);
		expect(upsert.mock.calls[0][0].update).toEqual({ gaplessEnabled: true });
	});

	it('setCrossfade는 상한 15초·하한 500ms로 클램프해요', async () => {
		const store = new GuildSettingsStore();
		upsert.mockResolvedValueOnce(guild('guild'));
		update.mockResolvedValueOnce(guild('guild', { crossfadeEnabled: true, crossfadeMs: 15000 }));
		await expect(setCrossfade(store, 'guild', true, 30_000)).resolves.toEqual({ crossfadeEnabled: true, crossfadeMs: 15000 });
		expect(update.mock.calls[0][0].data).toEqual({ crossfadeEnabled: true, crossfadeMs: 15000 });

		const other = new GuildSettingsStore();
		upsert.mockResolvedValueOnce(guild('guild'));
		update.mockResolvedValueOnce(guild('guild', { crossfadeEnabled: true, crossfadeMs: 500 }));
		await expect(setCrossfade(other, 'guild', true, 100)).resolves.toEqual({ crossfadeEnabled: true, crossfadeMs: 500 });
		expect(update.mock.calls[1][0].data).toEqual({ crossfadeEnabled: true, crossfadeMs: 500 });
	});

	it('setCrossfade는 기간을 넘기지 않으면 crossfadeMs를 건드리지 않고 캐시를 갱신해요', async () => {
		const store = new GuildSettingsStore();
		upsert.mockResolvedValueOnce(guild('guild'));
		update.mockResolvedValueOnce(guild('guild', { crossfadeEnabled: false, crossfadeMs: 2500 }));
		await expect(setCrossfade(store, 'guild', false)).resolves.toEqual({ crossfadeEnabled: false, crossfadeMs: 2500 });
		expect(update.mock.calls[0][0].data).toEqual({ crossfadeEnabled: false });

		// 저장 직후 읽기는 캐시에서 — DB 조회는 setCrossfade의 1회뿐이에요
		await expect(getMixerSettings(store, 'guild')).resolves.toEqual({ gaplessEnabled: false, crossfadeEnabled: false, crossfadeMs: 2500 });
		expect(upsert).toHaveBeenCalledTimes(1);
	});
});
