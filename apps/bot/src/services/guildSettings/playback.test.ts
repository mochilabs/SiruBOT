import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Guild } from '@sirubot/prisma';
import type { GuildMember } from 'discord.js';
import type { RepeatMode } from 'lavalink-client';

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock('@sapphire/framework', () => ({ container: { db: { guild: { upsert } } } }));
vi.mock('@sirubot/utils', async () => {
	const { MemoryCache } = await import('../../../../../packages/utils/src/memoryCache.ts');
	const { normalizeCustomCommandPrefix } = await import('../../../../../packages/utils/src/customCommand.ts');
	const { normalizeEmbedFixSites } = await import('../../../../../packages/utils/src/chatTools.ts');
	return { MemoryCache, normalizeCustomCommandPrefix, normalizeEmbedFixSites };
});

import { getDJRole, getEnableController, hasDJRole, setRepeat, setSponsorBlockSegments, updateVolume } from './playback.ts';
import { GuildSettingsStore } from './store.ts';

function guild(id = 'guild', overrides: Partial<Guild> = {}): Guild {
	return { id, volume: 10, repeat: 'off', djRoleId: null, ...overrides } as Guild;
}

function member({ admin = false, roles = [] as string[] } = {}): GuildMember {
	return {
		permissions: { has: vi.fn().mockReturnValue(admin) },
		roles: { cache: new Map(roles.map((role) => [role, true])) }
	} as unknown as GuildMember;
}

describe('playback 도메인 CRUD', () => {
	beforeEach(() => {
		upsert.mockReset();
	});

	it('updateVolume은 단일 필드로 쓰고 이후 읽기는 캐시에서 해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { volume: 40 }));
		const store = new GuildSettingsStore();
		await expect(updateVolume(store, 'guild', 40)).resolves.toMatchObject({ volume: 40 });
		expect(upsert.mock.calls[0][0].update).toEqual({ volume: 40 });

		await expect(getDJRole(store, 'guild')).resolves.toBeNull();
		expect(upsert).toHaveBeenCalledTimes(1);
	});

	it('hasDJRole은 DJ 역할이 없거나 관리자면 항상 허용해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { djRoleId: null }));
		const store = new GuildSettingsStore();
		await expect(hasDJRole(store, 'guild', member())).resolves.toBe(true);

		upsert.mockReset();
		upsert.mockResolvedValueOnce(guild('guild', { djRoleId: 'dj-1' }));
		const withRole = new GuildSettingsStore();
		await expect(hasDJRole(withRole, 'guild', member({ admin: true }))).resolves.toBe(true);
	});

	it('hasDJRole은 DJ 역할을 가진 멤버만 통과시켜요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { djRoleId: 'dj-1' }));
		const store = new GuildSettingsStore();
		await expect(hasDJRole(store, 'guild', member({ roles: ['dj-1'] }))).resolves.toBe(true);

		const another = new GuildSettingsStore();
		upsert.mockResolvedValueOnce(guild('guild', { djRoleId: 'dj-1' }));
		await expect(hasDJRole(another, 'guild', member({ roles: ['other'] }))).resolves.toBe(false);
	});

	it('setRepeat는 허용된 값만 받고 그 외에는 예외를 던져요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { repeat: 'queue' }));
		const store = new GuildSettingsStore();
		await expect(setRepeat(store, 'guild', 'queue')).resolves.toBe('queue');
		expect(upsert.mock.calls[0][0].update).toEqual({ repeat: 'queue' });

		upsert.mockReset();
		await expect(setRepeat(store, 'guild', 'all' as unknown as RepeatMode)).rejects.toThrow('Invalid repeat value');
		expect(upsert).not.toHaveBeenCalled();
	});

	it('setSponsorBlockSegments는 목록 전체를 그대로 저장해요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { sponsorBlockSegments: ['sponsor', 'intro'] }));
		const store = new GuildSettingsStore();
		await expect(setSponsorBlockSegments(store, 'guild', ['sponsor', 'intro'])).resolves.toEqual(['sponsor', 'intro']);
		expect(upsert.mock.calls[0][0].update).toEqual({ sponsorBlockSegments: ['sponsor', 'intro'] });
	});

	it('getEnableController는 저장된 값을 그대로 읽어요', async () => {
		upsert.mockResolvedValueOnce(guild('guild', { enableController: true }));
		const store = new GuildSettingsStore();
		await expect(getEnableController(store, 'guild')).resolves.toBe(true);
	});
});
