import { describe, expect, it, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import { runCustomCommandSpec, type CustomCommandContext, type CustomCommandSendPayload } from './interpreter.ts';

const MANAGE_ROLES = 0x10000000n;
const MANAGE_MESSAGES = 0x2000n;

interface FakeHarness {
	ctx: CustomCommandContext;
	sent: CustomCommandSendPayload[];
	addRole: ReturnType<typeof vi.fn>;
	removeRole: ReturnType<typeof vi.fn>;
	react: ReturnType<typeof vi.fn>;
	pin: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
}

function fakeHarness(overrides: { args?: string[]; roles?: string[]; permissions?: bigint } = {}): FakeHarness {
	const sent: CustomCommandSendPayload[] = [];
	const addRole = vi.fn(async () => undefined);
	const removeRole = vi.fn(async () => undefined);
	const react = vi.fn(async () => undefined);
	const pin = vi.fn(async () => undefined);
	const del = vi.fn(async () => undefined);
	const memberRoles = new Set(overrides.roles ?? []);
	const ctx: CustomCommandContext = {
		channel: { send: async (payload) => (sent.push(payload), undefined) },
		member: {
			id: 'user-1',
			permissions: overrides.permissions ?? MANAGE_MESSAGES,
			hasRole: (roleId) => memberRoles.has(roleId),
			addRole,
			removeRole
		},
		guild: {
			botTopRolePosition: 10,
			botCanManageRoles: true,
			getRole: (roleId) => ({ id: roleId, position: 5, managed: false })
		},
		channelId: '223456789012345678',
		args: overrides.args ?? [],
		triggerMessage: { react, pin, delete: del }
	};
	return { ctx, sent, addRole, removeRole, react, pin, delete: del };
}

function spec(steps: unknown[], access?: unknown): unknown {
	return { version: 2, ...(access === undefined ? {} : { access }), steps };
}

function v1Spec(steps: unknown[]): unknown {
	return { version: 1, steps };
}

describe('runCustomCommandSpec — 호환(v1)', () => {
	it('runs send_message steps in order (v1 스펙 호환)', async () => {
		const h = fakeHarness();
		const result = await runCustomCommandSpec(
			v1Spec([
				{ type: 'send_message', text: '첫째' },
				{ type: 'send_message', text: '둘째' }
			]),
			h.ctx
		);
		expect(result).toEqual({ kind: 'ok', sent: 2 });
		expect(h.sent.map((p) => p.content)).toEqual(['첫째', '둘째']);
	});

	it('waits for delay steps between messages', async () => {
		vi.useFakeTimers();
		try {
			const h = fakeHarness();
			const run = runCustomCommandSpec(
				v1Spec([
					{ type: 'send_message', text: 'a' },
					{ type: 'delay', seconds: 5 },
					{ type: 'send_message', text: 'b' }
				]),
				h.ctx
			);
			await vi.advanceTimersByTimeAsync(4_999);
			expect(h.sent.map((p) => p.content)).toEqual(['a']);
			await vi.advanceTimersByTimeAsync(1);
			expect(await run).toEqual({ kind: 'ok', sent: 2 });
			expect(h.sent.map((p) => p.content)).toEqual(['a', 'b']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('rejects specs failing the schema', async () => {
		const h = fakeHarness();
		expect(await runCustomCommandSpec({ version: 3, steps: [{ type: 'send_message', text: 'x' }] }, h.ctx)).toEqual({ kind: 'invalid_spec' });
		expect(h.sent).toEqual([]);
	});

	it('stops remaining steps when a send fails', async () => {
		let call = 0;
		const h = fakeHarness();
		h.ctx.channel.send = async (payload) => {
			call++;
			if (call === 2) throw new Error('channel deleted');
			h.sent.push(payload);
			return undefined;
		};
		const result = await runCustomCommandSpec(
			v1Spec([
				{ type: 'send_message', text: 'a' },
				{ type: 'send_message', text: 'b' },
				{ type: 'send_message', text: 'c' }
			]),
			h.ctx
		);
		expect(result.kind).toBe('action_failed');
		expect(result).toMatchObject({ sent: 1 });
		expect(h.sent.map((p) => p.content)).toEqual(['a']);
	});
});

describe('runCustomCommandSpec — 실행 제한(access)', () => {
	const roleStep = [{ type: 'add_role', roleId: '123456789012345678' }];

	it('denies when access roles do not match', async () => {
		const h = fakeHarness({ roles: [] });
		const result = await runCustomCommandSpec(spec(roleStep, { mode: 'roles', roleIds: ['123456789012345678'] }), h.ctx);
		expect(result).toEqual({ kind: 'access_denied' });
		expect(h.addRole).not.toHaveBeenCalled();
	});

	it('allows when the executor holds an allowed role', async () => {
		const h = fakeHarness({ roles: ['123456789012345678'] });
		const result = await runCustomCommandSpec(spec(roleStep, { mode: 'roles', roleIds: ['123456789012345678'] }), h.ctx);
		expect(result.kind).toBe('ok');
		expect(h.addRole).toHaveBeenCalledWith('123456789012345678');
	});

	it('requires all listed permissions for permissions mode', async () => {
		const h1 = fakeHarness({ permissions: MANAGE_ROLES });
		expect(
			(
				await runCustomCommandSpec(
					spec([{ type: 'pin_message' }], { mode: 'permissions', permissions: ['ManageRoles', 'ManageMessages'] }),
					h1.ctx
				)
			).kind
		).toBe('access_denied');
		const h2 = fakeHarness({ permissions: MANAGE_ROLES | MANAGE_MESSAGES });
		expect(
			(
				await runCustomCommandSpec(
					spec([{ type: 'pin_message' }], { mode: 'permissions', permissions: ['ManageRoles', 'ManageMessages'] }),
					h2.ctx
				)
			).kind
		).toBe('ok');
	});
});

describe('runCustomCommandSpec — 역할 변경', () => {
	const roleAccess = { mode: 'roles', roleIds: ['999000000000000001'] };

	it('adds and removes roles through the member API', async () => {
		const h = fakeHarness({ roles: ['999000000000000001'] });
		const result = await runCustomCommandSpec(
			spec(
				[
					{ type: 'add_role', roleId: '123456789012345678' },
					{ type: 'remove_role', roleId: '234567890123456789' }
				],
				roleAccess
			),
			h.ctx
		);
		expect(result.kind).toBe('ok');
		expect(h.addRole).toHaveBeenCalledWith('123456789012345678');
		expect(h.removeRole).toHaveBeenCalledWith('234567890123456789');
	});

	it('rejects roles above the bot top role and stops the run', async () => {
		const h = fakeHarness({ roles: ['999000000000000001'] });
		h.ctx.guild.getRole = (roleId) => ({ id: roleId, position: 99, managed: false });
		const result = await runCustomCommandSpec(
			spec(
				[
					{ type: 'add_role', roleId: '123456789012345678' },
					{ type: 'send_message', text: '이건 안 나와야 해요' }
				],
				roleAccess
			),
			h.ctx
		);
		expect(result.kind).toBe('action_failed');
		expect(h.addRole).not.toHaveBeenCalled();
		expect(h.sent).toEqual([]);
	});

	it('rejects managed roles and missing bot permission', async () => {
		const h = fakeHarness({ roles: ['999000000000000001'] });
		h.ctx.guild.getRole = (roleId) => ({ id: roleId, position: 5, managed: true });
		expect((await runCustomCommandSpec(spec([{ type: 'add_role', roleId: '123456789012345678' }], roleAccess), h.ctx)).kind).toBe(
			'action_failed'
		);
		h.ctx.guild.getRole = (roleId) => ({ id: roleId, position: 5, managed: false });
		h.ctx.guild.botCanManageRoles = false;
		expect((await runCustomCommandSpec(spec([{ type: 'add_role', roleId: '123456789012345678' }], roleAccess), h.ctx)).kind).toBe(
			'action_failed'
		);
	});
});

describe('runCustomCommandSpec — if 분기', () => {
	const ifStep = (condition: unknown) => ({
		type: 'if',
		condition,
		then: [{ type: 'send_message', text: 'then' }],
		else: [{ type: 'send_message', text: 'else' }]
	});

	it('branches on has_role', async () => {
		const withRole = fakeHarness({ roles: ['123456789012345678'] });
		await runCustomCommandSpec(spec([ifStep({ kind: 'has_role', roleId: '123456789012345678' })]), withRole.ctx);
		expect(withRole.sent.map((p) => p.content)).toEqual(['then']);
		const withoutRole = fakeHarness({ roles: [] });
		await runCustomCommandSpec(spec([ifStep({ kind: 'has_role', roleId: '123456789012345678' })]), withoutRole.ctx);
		expect(withoutRole.sent.map((p) => p.content)).toEqual(['else']);
	});

	it('branches on channel_match and arg_matches', async () => {
		const h = fakeHarness({ args: ['파란'] });
		await runCustomCommandSpec(spec([ifStep({ kind: 'channel_match', channelId: '223456789012345678' })]), h.ctx);
		await runCustomCommandSpec(spec([ifStep({ kind: 'arg_matches', index: 0, value: '파란' })]), h.ctx);
		await runCustomCommandSpec(spec([ifStep({ kind: 'arg_matches', index: 1, value: '파란' })]), h.ctx);
		expect(h.sent.map((p) => p.content)).toEqual(['then', 'then', 'else']);
	});
});

describe('runCustomCommandSpec — 인수 치환', () => {
	it('substitutes argv tokens and strips mentions from values', async () => {
		const h = fakeHarness({ args: ['<@123456789012345678>', '홍길동'] });
		await runCustomCommandSpec(spec([{ type: 'send_message', text: '안녕 {argv0} {argv1} {argv4}' }]), h.ctx);
		expect(h.sent[0]!.content).toBe('안녕  홍길동 ');
	});

	it('replaces out-of-range argv tokens with empty strings', async () => {
		const h = fakeHarness({ args: ['a'] });
		await runCustomCommandSpec(spec([{ type: 'send_message', text: '{argv9}!' }]), h.ctx);
		expect(h.sent[0]!.content).toBe('!');
	});
});

describe('runCustomCommandSpec — CV2 디자인', () => {
	it('sends design as a Components V2 container with mentions disabled', async () => {
		const h = fakeHarness();
		const result = await runCustomCommandSpec(
			spec([
				{
					type: 'send_message',
					design: {
						accentColor: 'blue',
						items: [
							{ kind: 'text', content: '## 공지' },
							{ kind: 'separator' },
							{ kind: 'section', content: '본문 {argv0}', thumbnailUrl: 'https://example.com/a.png' },
							{ kind: 'media', urls: ['https://example.com/b.png'] }
						]
					}
				}
			]),
			h.ctx
		);
		expect(result.kind).toBe('ok');
		const payload = h.sent[0]!;
		expect(payload.flags).toContain(MessageFlags.IsComponentsV2);
		expect(payload.allowedMentions).toEqual({ parse: [] });
		expect(payload.components).toHaveLength(1);
	});
});

describe('runCustomCommandSpec — 부수 액션', () => {
	it('reacts to and pins the trigger message', async () => {
		const h = fakeHarness();
		const result = await runCustomCommandSpec(spec([{ type: 'add_reaction', emoji: '🎉' }, { type: 'pin_message' }]), h.ctx);
		expect(result.kind).toBe('ok');
		expect(h.react).toHaveBeenCalledWith('🎉');
		expect(h.pin).toHaveBeenCalled();
	});

	it('deletes the trigger message after the delay without blocking the run', async () => {
		vi.useFakeTimers();
		try {
			const h = fakeHarness();
			const run = runCustomCommandSpec(
				spec([
					{ type: 'delete_trigger', afterSeconds: 5 },
					{ type: 'send_message', text: '바로 나감' }
				]),
				h.ctx
			);
			expect(await run).toEqual({ kind: 'ok', sent: 1 });
			expect(h.sent.map((p) => p.content)).toEqual(['바로 나감']);
			expect(h.delete).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(5_000);
			expect(h.delete).toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
