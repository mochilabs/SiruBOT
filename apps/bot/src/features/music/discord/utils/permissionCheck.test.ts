import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { checkDJOrAlone, checkInBotVoice, checkManageGuild, checkRemoteControl } from './permissionCheck.ts';

const { getDJRole } = vi.hoisted(() => ({ getDJRole: vi.fn() }));

vi.mock('@sapphire/framework', () => ({ container: { guildService: {} } }));
vi.mock('../../../../services/guildSettings/playback.ts', () => ({ getDJRole }));

function member(options: { admin?: boolean; manager?: boolean; djRole?: boolean; voiceMemberIds?: string[] | null }) {
	return {
		id: 'user',
		guild: { id: 'g' },
		permissions: {
			has: vi.fn(
				(flag: bigint) =>
					(options.admin === true && flag === PermissionFlagsBits.Administrator) ||
					(options.manager === true && flag === PermissionFlagsBits.ManageGuild)
			)
		},
		roles: { cache: new Map(options.djRole ? [['dj-role', {}]] : []) },
		voice: {
			channelId: options.voiceMemberIds === null ? null : 'voice',
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

describe('remote control (voice exemption)', () => {
	beforeEach(() => {
		getDJRole.mockReset();
	});

	it('treats administrators, managers and DJ role holders as remote controllers', async () => {
		getDJRole.mockResolvedValue('dj-role');
		await expect(checkRemoteControl('g', member({ admin: true, voiceMemberIds: null }))).resolves.toBe(true);
		await expect(checkRemoteControl('g', member({ manager: true, voiceMemberIds: null }))).resolves.toBe(true);
		await expect(checkRemoteControl('g', member({ djRole: true, voiceMemberIds: null }))).resolves.toBe(true);
		await expect(checkRemoteControl('g', member({ voiceMemberIds: null }))).resolves.toBe(false);
	});

	it('lets managers pass the DJ check from outside voice', async () => {
		getDJRole.mockResolvedValue('dj-role');
		await expect(checkDJOrAlone('g', member({ manager: true, voiceMemberIds: null }))).resolves.toBe(true);
	});

	it('requires the bot voice channel only from members without remote control', async () => {
		getDJRole.mockResolvedValue('dj-role');
		await expect(checkInBotVoice('g', member({ voiceMemberIds: ['user'] }), 'voice')).resolves.toBe(true);
		await expect(checkInBotVoice('g', member({ voiceMemberIds: ['user'] }), 'other')).resolves.toBe(false);
		await expect(checkInBotVoice('g', member({ voiceMemberIds: null }), 'other')).resolves.toBe(false);
		await expect(checkInBotVoice('g', member({ djRole: true, voiceMemberIds: null }), 'other')).resolves.toBe(true);
		await expect(checkInBotVoice('g', member({ manager: true, voiceMemberIds: ['user'] }), 'other')).resolves.toBe(true);
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
