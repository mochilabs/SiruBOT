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
