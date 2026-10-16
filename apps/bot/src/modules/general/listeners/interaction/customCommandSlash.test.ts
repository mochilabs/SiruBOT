import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';

import { handleCustomCommandSlashInteraction } from './customCommandSlash.ts';

const { findMany, deferReply, editReply, deleteReply, channelSend, addRole, react, pin } = vi.hoisted(() => ({
	findMany: vi.fn(async () => [] as unknown[]),
	deferReply: vi.fn(async () => undefined),
	editReply: vi.fn(async () => undefined),
	deleteReply: vi.fn(async () => undefined),
	channelSend: vi.fn(async () => undefined),
	addRole: vi.fn(async () => undefined),
	react: vi.fn(async () => undefined),
	pin: vi.fn(async () => undefined)
}));

vi.mock('@sapphire/framework', () => ({
	container: {},
	Events: { InteractionCreate: 'interactionCreate' },
	Listener: class {}
}));
vi.mock('../../../../services/customCommands/store.ts', () => ({
	findCustomCommand: vi.fn(async () => null),
	getGuildCustomCommands: vi.fn()
}));

function fakeInteraction(overrides: { commandName?: string; roles?: string[]; args?: Record<string, string> } = {}) {
	const roles = new Set(overrides.roles ?? []);
	const args = overrides.args ?? {};
	return {
		isChatInputCommand: () => true,
		inGuild: () => true,
		guildId: 'guild-1',
		commandName: overrides.commandName ?? '인사',
		user: { id: 'user-1' },
		options: { getString: (name: string) => args[name] ?? null },
		deferReply,
		editReply,
		deleteReply,
		fetchReply: async () => ({ react, pin }),
		memberPermissions: { bitfield: 0x2000n },
		channel: { send: channelSend },
		guild: {
			members: {
				cache: {
					get: () => ({
						id: 'user-1',
						roles: {
							cache: { has: (roleId: string) => roles.has(roleId) },
							add: addRole,
							remove: vi.fn()
						}
					})
				},
				me: { roles: { highest: { position: 10 } }, permissions: { has: () => true } }
			},
			roles: { cache: { get: (roleId: string) => ({ id: roleId, position: 5, managed: false }) } }
		}
	} as unknown as ChatInputCommandInteraction;
}

async function mockEntry(entry: unknown) {
	const { findCustomCommand } = await import('../../../../services/customCommands/store.ts');
	vi.mocked(findCustomCommand).mockResolvedValue(entry as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	void findMany;
});

describe('handleCustomCommandSlashInteraction', () => {
	it('ignores names that are not slash custom commands', async () => {
		await mockEntry(null);
		expect(await handleCustomCommandSlashInteraction(fakeInteraction({ commandName: 'play' }))).toBe(false);
		expect(deferReply).not.toHaveBeenCalled();
	});

	it('runs the spec and routes the first message to the interaction reply', async () => {
		await mockEntry({
			id: 'row-1',
			name: '인사',
			description: 'd',
			method: 'slash',
			spec: {
				version: 2,
				steps: [
					{ type: 'send_message', text: '첫 인사 {argv0}' },
					{ type: 'send_message', text: '둘째' }
				]
			}
		});
		const handled = await handleCustomCommandSlashInteraction(fakeInteraction({ args: { argument1: '홍길동' } }));
		expect(handled).toBe(true);
		expect(deferReply).toHaveBeenCalled();
		expect(editReply).toHaveBeenCalledWith(expect.objectContaining({ content: '첫 인사 홍길동' }));
		expect(channelSend).toHaveBeenCalledWith(expect.objectContaining({ content: '둘째' }));
	});

	it('reports access denial through the reply', async () => {
		await mockEntry({
			id: 'row-1',
			name: '인사',
			description: 'd',
			method: 'slash',
			spec: {
				version: 2,
				access: { mode: 'roles', roleIds: ['999000000000000001'] },
				steps: [{ type: 'add_role', roleId: '123456789012345678' }]
			}
		});
		await handleCustomCommandSlashInteraction(fakeInteraction({ roles: [] }));
		expect(editReply).toHaveBeenCalledWith(expect.stringContaining('권한이 없어요'));
		expect(addRole).not.toHaveBeenCalled();
	});

	it('acks with a small message when the spec sends nothing', async () => {
		await mockEntry({
			id: 'row-1',
			name: '역할부여',
			description: 'd',
			method: 'slash',
			spec: {
				version: 2,
				access: { mode: 'roles', roleIds: ['999000000000000001'] },
				steps: [{ type: 'add_role', roleId: '123456789012345678' }]
			}
		});
		await handleCustomCommandSlashInteraction(fakeInteraction({ roles: ['999000000000000001'] }));
		expect(addRole).toHaveBeenCalledWith('123456789012345678');
		expect(editReply).toHaveBeenCalledWith(expect.stringContaining('처리했어요'));
	});
});
