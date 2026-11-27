import type { PrismaClient } from '@sirubot/prisma';
import { describe, expect, it, vi } from 'vitest';
import { withGuildTheme, currentGuildTheme } from '../../lib/guildTheme.ts';
import { GuildSettingsStore } from './store.ts';

function makeStore() {
	const upsert = vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, themePreset: 'blue' }));
	const store = new GuildSettingsStore({ db: { guild: { upsert } } as unknown as Pick<PrismaClient, 'guild'> });
	return { store, upsert };
}

describe('길드 설정 캐시 — 테마 조회가 DB를 반복해서 치지 않아요', () => {
	it('같은 길드를 여러 번·동시에 읽어도 DB는 한 번만 읽어요', async () => {
		const { store, upsert } = makeStore();
		await Promise.all(Array.from({ length: 50 }, () => store.getGuild('1')));
		for (let i = 0; i < 50; i++) await store.getGuild('1');
		expect(upsert).toHaveBeenCalledTimes(1);
	});

	it('상호작용 맥락 안에서 렌더를 여러 번 해도 맥락을 연 한 번만 조회해요', async () => {
		const { store, upsert } = makeStore();
		const load = async (guildId: string) => (await store.getGuild(guildId)).themePreset;
		await withGuildTheme('1', load, async () => {
			for (let i = 0; i < 100; i++) expect(currentGuildTheme()).toBe('blue');
			await withGuildTheme('1', load, () => expect(currentGuildTheme()).toBe('blue'));
		});
		expect(upsert).toHaveBeenCalledTimes(1);
	});

	it('대시보드 저장 후 무효화하면 다음 한 번만 다시 읽어요', async () => {
		const { store, upsert } = makeStore();
		await store.getGuild('1');
		store.invalidate('1');
		await store.getGuild('1');
		await store.getGuild('1');
		expect(upsert).toHaveBeenCalledTimes(2);
	});
});
