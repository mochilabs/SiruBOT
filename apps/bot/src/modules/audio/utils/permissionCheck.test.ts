import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { checkDJOrAlone, checkManageGuild } from './permissionCheck.ts';

const { getDJRole } = vi.hoisted(() => ({ getDJRole: vi.fn() }));

vi.mock('@sapphire/framework', () => ({ container: { guildService: { getDJRole } } }));

function member(options: { admin?: boolean; djRole?: boolean; voiceMemberIds?: string[] | null }) {
	return {
		permissions: { has: vi.fn((flag: bigint) => (options.admin ? flag === PermissionFlagsBits.Administrator : false)) },
		roles: { cache: { has: vi.fn(() => options.djRole === true) } },
		voice: {
			channel:
				options.voiceMemberIds === null
					? null
					: {
							members: {
								filter: vi.fn(() => ({
									size: options.voiceMemberIds?.filter((id) => !id.startsWith('bot')).length ?? 0
								}))
							}
						}
		}
	} as never;
}

describe('checkDJOrAlone branch matrix', () => {
	beforeEach(() => {
		getDJRole.mockReset();
	});

	it('allows everyone when the DJ role is not configured', async () => {
		getDJRole.mockResolvedValue(null);
		await expect(checkDJOrAlone('g', member({ voiceMemberIds: null }))).resolves.toBe(true);
	});

	it('allows administrators even without the DJ role', async () => {
		getDJRole.mockResolvedValue('dj-role');
		await expect(checkDJOrAlone('g', member({ admin: true, voiceMemberIds: null }))).resolves.toBe(true);
	});

	it('allows members holding the DJ role', async () => {
		getDJRole.mockResolvedValue('dj-role');
		await expect(checkDJOrAlone('g', member({ djRole: true, voiceMemberIds: null }))).resolves.toBe(true);
	});

	it('allows a lone non-bot listener in the voice channel without the DJ role', async () => {
		getDJRole.mockResolvedValue('dj-role');
		await expect(checkDJOrAlone('g', member({ voiceMemberIds: ['user', 'bot-user'] }))).resolves.toBe(true);
	});

	it('denies when others are listening and the member lacks the DJ role', async () => {
		getDJRole.mockResolvedValue('dj-role');
		await expect(checkDJOrAlone('g', member({ voiceMemberIds: ['user', 'other', 'bot-user'] }))).resolves.toBe(false);
	});

	it('denies when the member is not in a voice channel without the DJ role', async () => {
		getDJRole.mockResolvedValue('dj-role');
		await expect(checkDJOrAlone('g', member({ voiceMemberIds: null }))).resolves.toBe(false);
	});
});

describe('checkManageGuild', () => {
	it('mirrors the ManageGuild permission flag', () => {
		const yes = { permissions: { has: vi.fn(() => true) } } as never;
		const no = { permissions: { has: vi.fn(() => false) } } as never;
		expect(checkManageGuild(yes)).toBe(true);
		expect(checkManageGuild(no)).toBe(false);
		expect((yes as { permissions: { has: ReturnType<typeof vi.fn> } }).permissions.has).toHaveBeenCalledWith(PermissionFlagsBits.ManageGuild);
	});
});
