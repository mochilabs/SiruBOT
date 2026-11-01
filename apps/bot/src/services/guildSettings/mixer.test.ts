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

import { getMixerSettings, setAutomix, setCrossfade, setGapless, setNormalization, setTransitionMode } from './mixer.ts';
import { GuildSettingsStore } from './store.ts';

function guild(id = 'guild', overrides: Partial<Guild> = {}): Guild {
	return {
		id,
		gaplessEnabled: false,
		crossfadeEnabled: false,
		crossfadeMs: 1000,
		normalizationEnabled: false,
		automixEnabled: false,
		automixMaxTempoChange: 0.06,
		automixMinConfidence: 0.3,
		...overrides
	} as Guild;
}

describe('mixer 도메인 CRUD', () => {
	beforeEach(() => {
		upsert.mockReset();
		update.mockReset();
	});

	it.each(['off', 'crossfade', 'automix'] as const)('전환 방식 %s는 두 플래그만 원자적으로 저장해요', async (mode) => {
		const store = new GuildSettingsStore();
		upsert.mockResolvedValueOnce(guild('guild'));
		update.mockResolvedValueOnce(guild('guild'));
		await setTransitionMode(store, 'guild', mode);
		expect(update.mock.calls[0][0].data).toEqual({ crossfadeEnabled: mode !== 'off', automixEnabled: mode === 'automix' });
	});

	it('갭리스·크로스페이드 설정을 한 번에 읽어요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { gaplessEnabled: true, crossfadeEnabled: true, crossfadeMs: 2500, normalizationEnabled: true }));
		const store = new GuildSettingsStore();
		await expect(getMixerSettings(store, 'guild')).resolves.toEqual({
			gaplessEnabled: true,
			crossfadeEnabled: true,
			crossfadeMs: 2500,
			normalizationEnabled: true,
			automixEnabled: false,
			automixMaxTempoChange: 0.06,
			automixMinConfidence: 0.3
		});
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
		expect(update.mock.calls[0][0].data).toEqual({ crossfadeEnabled: false, automixEnabled: false });

		// 저장 직후 읽기는 캐시에서 — DB 조회는 setCrossfade의 1회뿐이에요
		await expect(getMixerSettings(store, 'guild')).resolves.toEqual({
			gaplessEnabled: false,
			crossfadeEnabled: false,
			crossfadeMs: 2500,
			normalizationEnabled: false,
			automixEnabled: false,
			automixMaxTempoChange: 0.06,
			automixMinConfidence: 0.3
		});
		expect(upsert).toHaveBeenCalledTimes(1);
	});

	it('setNormalization는 단일 필드로 저장해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { normalizationEnabled: true }));
		const store = new GuildSettingsStore();
		await expect(setNormalization(store, 'guild', true)).resolves.toBe(true);
		expect(upsert.mock.calls[0][0].update).toEqual({ normalizationEnabled: true });
	});

	it('오토믹스를 켜면 크로스페이드와 옵션을 함께 저장하고 캐시를 갱신해요', async () => {
		const store = new GuildSettingsStore();
		upsert.mockResolvedValueOnce(guild());
		update.mockResolvedValueOnce(
			guild('guild', {
				crossfadeEnabled: true,
				automixEnabled: true,
				automixMaxTempoChange: 0.12,
				automixMinConfidence: 1
			})
		);
		const settings = await setAutomix(store, 'guild', true, 0.12, 1);
		expect(update).toHaveBeenCalledWith({
			where: { id: 'guild' },
			data: {
				automixEnabled: true,
				crossfadeEnabled: true,
				automixMaxTempoChange: 0.12,
				automixMinConfidence: 1
			}
		});
		expect(settings).toMatchObject({ automixEnabled: true, crossfadeEnabled: true, automixMaxTempoChange: 0.12, automixMinConfidence: 1 });
		expect(await getMixerSettings(store, 'guild')).toEqual(settings);
		expect(upsert).toHaveBeenCalledTimes(1);
	});

	it('오토믹스를 꺼도 크로스페이드와 저장한 옵션은 유지해요', async () => {
		const store = new GuildSettingsStore();
		upsert.mockResolvedValueOnce(guild('guild', { automixEnabled: true, crossfadeEnabled: true }));
		update.mockResolvedValueOnce(guild('guild', { crossfadeEnabled: true, automixMaxTempoChange: 0.1, automixMinConfidence: 0.5 }));
		expect(await setAutomix(store, 'guild', false)).toMatchObject({
			automixEnabled: false,
			crossfadeEnabled: true,
			automixMaxTempoChange: 0.1,
			automixMinConfidence: 0.5
		});
		expect(update.mock.calls[0][0].data).toEqual({ automixEnabled: false });
	});

	it('0인 옵션을 생략하지 않고 저장해요', async () => {
		upsert.mockResolvedValueOnce(guild());
		update.mockResolvedValueOnce(
			guild('guild', { automixEnabled: true, crossfadeEnabled: true, automixMaxTempoChange: 0, automixMinConfidence: 0 })
		);
		await setAutomix(new GuildSettingsStore(), 'guild', true, 0, 0);
		expect(update.mock.calls[0][0].data).toEqual({
			automixEnabled: true,
			crossfadeEnabled: true,
			automixMaxTempoChange: 0,
			automixMinConfidence: 0
		});
	});

	it.each([-0.01, 0.121, Number.NaN, Number.POSITIVE_INFINITY])('유효하지 않은 템포 비율 %s는 DB에 쓰지 않아요', async (value) => {
		await expect(setAutomix(new GuildSettingsStore(), 'guild', true, value)).rejects.toThrow(RangeError);
		expect(upsert).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
	});

	it.each([-0.01, 1.01, Number.NaN, Number.NEGATIVE_INFINITY])('유효하지 않은 신뢰도 %s는 DB에 쓰지 않아요', async (value) => {
		await expect(setAutomix(new GuildSettingsStore(), 'guild', true, undefined, value)).rejects.toThrow(RangeError);
		expect(upsert).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
	});
});
