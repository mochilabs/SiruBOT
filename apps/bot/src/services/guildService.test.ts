import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Guild } from '@sirubot/prisma';
import { GuildService } from './guildService.ts';

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock('@sapphire/framework', () => ({ container: { db: { guild: { upsert } } } }));
vi.mock('@sirubot/utils', async () => {
	const { MemoryCache } = await import('../../../../packages/utils/src/memoryCache.ts');
	return { MemoryCache };
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
