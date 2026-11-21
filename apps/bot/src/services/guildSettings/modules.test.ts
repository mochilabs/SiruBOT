import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Guild } from '@sirubot/prisma';

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));

const db = { guild: { upsert } } as never;
vi.mock('@sirubot/utils', async () => {
	const { MemoryCache } = await import('../../../../../packages/utils/src/memoryCache.ts');
	return { MemoryCache };
});

import { getDisabledModules, isMessageFeatureEnabled, isModuleEnabled, setDisabledModules } from './modules.ts';
import { GuildSettingsStore } from './store.ts';

function guild(disabledModules: string[], id = 'guild'): Guild {
	return { id, disabledModules } as Guild;
}

describe('모듈 켜기/끄기 저장소', () => {
	beforeEach(() => {
		upsert.mockReset();
	});

	it('기본은 모두 켜짐이에요', async () => {
		upsert.mockResolvedValueOnce(guild([]));
		const store = new GuildSettingsStore({ db });
		await expect(isModuleEnabled(store, 'guild', 'fun')).resolves.toBe(true);
	});

	it('끈 모듈만 꺼진 것으로 판정해요', async () => {
		upsert.mockResolvedValueOnce(guild(['fun']));
		const store = new GuildSettingsStore({ db });
		await expect(isModuleEnabled(store, 'guild', 'fun')).resolves.toBe(false);
		await expect(isModuleEnabled(store, 'guild', 'music')).resolves.toBe(true);
	});

	it('DM(길드 없음)은 DB를 읽지 않고 켜짐이에요', async () => {
		const store = new GuildSettingsStore({ db });
		await expect(isModuleEnabled(store, null, 'fun')).resolves.toBe(true);
		expect(upsert).not.toHaveBeenCalled();
	});

	it('저장 값에 관리 모듈이 있어도 켜진 것으로 보고, 읽을 때도 정리해요', async () => {
		upsert.mockResolvedValueOnce(guild(['admin', 'fun', 'nope']));
		const store = new GuildSettingsStore({ db });
		await expect(isModuleEnabled(store, 'guild', 'admin')).resolves.toBe(true);
		await expect(getDisabledModules(store, 'guild')).resolves.toEqual(['fun']);
	});

	it('저장할 때 관리 모듈과 모르는 id는 무시하고 캐시를 갱신해요', async () => {
		upsert.mockResolvedValueOnce(guild(['music', 'fun']));
		const store = new GuildSettingsStore({ db });
		await expect(setDisabledModules(store, 'guild', ['fun', 'admin', 'nope', 'music', 'fun'])).resolves.toEqual(['music', 'fun']);
		expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { disabledModules: ['music', 'fun'] } }));
		// 저장 직후 읽기는 캐시에서 와요
		await expect(isModuleEnabled(store, 'guild', 'fun')).resolves.toBe(false);
		expect(upsert).toHaveBeenCalledTimes(1);
	});

	it('메시지 기능은 속한 모듈이 꺼지면 꺼지고, 표에 없는 기능은 항상 켜져 있어요', async () => {
		upsert.mockResolvedValueOnce(guild(['community']));
		const store = new GuildSettingsStore({ db });
		await expect(isMessageFeatureEnabled(store, 'guild', 'greeting')).resolves.toBe(false);
		await expect(isMessageFeatureEnabled(store, 'guild', 'temp-voice')).resolves.toBe(false);
		await expect(isMessageFeatureEnabled(store, 'guild', 'ai-mention')).resolves.toBe(true);
		await expect(isMessageFeatureEnabled(store, 'guild', 'unknown-feature')).resolves.toBe(true);
	});
});
