import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildSlashOptions, countArgOptions, syncGuildSlashCommands } from './slashRegistry.ts';

const { containerMock, findMany, dbUpdate, commandCreate, commandEdit, commandDelete, commandFetch, logger } = vi.hoisted(() => ({
	containerMock: {} as Record<string, unknown>,
	findMany: vi.fn(async () => [] as unknown[]),
	dbUpdate: vi.fn(async () => undefined),
	commandCreate: vi.fn(async () => ({ id: 'created-1' })),
	commandEdit: vi.fn(async () => undefined),
	commandDelete: vi.fn(async () => undefined),
	commandFetch: vi.fn(async () => new Map()),
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('@sapphire/framework', () => ({ container: containerMock }));

function rows(...entries: Array<{ id: string; name: string; description?: string; applicationCommandId?: string | null; spec: unknown }>) {
	return entries.map((entry) => ({ createdBy: 'admin', ...entry }));
}

function fakeGuild() {
	return {
		commands: {
			fetch: commandFetch,
			create: commandCreate,
			edit: commandEdit,
			delete: commandDelete
		}
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	Object.assign(containerMock, {
		db: { customCommand: { findMany, update: dbUpdate } },
		client: { guilds: { cache: { get: vi.fn(() => fakeGuild()) } } },
		stores: {
			get: vi.fn(
				() =>
					new Map([
						['ping', {}],
						['play', {}]
					])
			)
		}
	});
});

describe('countArgOptions / buildSlashOptions', () => {
	it('counts the highest argv index across texts and designs', () => {
		const spec = {
			version: 2,
			steps: [
				{ type: 'send_message', text: '안녕 {argv0} {argv3}' },
				{
					type: 'send_message',
					design: { items: [{ kind: 'section', content: '{argv1}', thumbnailUrl: 'https://example.com/a.png' }] }
				},
				{ type: 'if', condition: { kind: 'arg_matches', index: 2, value: 'x' }, then: [{ type: 'send_message', text: 'ok' }] }
			]
		};
		expect(countArgOptions(spec)).toBe(4);
		expect(buildSlashOptions(spec).map((option) => option.name)).toEqual(['argument1', 'argument2', 'argument3', 'argument4']);
		expect(buildSlashOptions({ version: 2, steps: [{ type: 'pin_message' }] })).toEqual([]);
	});
});

describe('syncGuildSlashCommands', () => {
	const textSpec = { version: 2, steps: [{ type: 'send_message', text: '안녕 {argv0}' }] };

	async function withRows(...entries: Parameters<typeof rows>) {
		findMany.mockResolvedValue(rows(...entries));
	}

	it('creates missing commands and stores the application command ID', async () => {
		await withRows({ id: 'row-1', name: '인사', description: '인사 명령어', spec: textSpec });
		await syncGuildSlashCommands('guild-1', logger);
		expect(commandCreate).toHaveBeenCalledWith({
			name: '인사',
			description: '인사 명령어',
			options: [expect.objectContaining({ name: 'argument1' })]
		});
		expect(dbUpdate).toHaveBeenCalledWith({ where: { id: 'row-1' }, data: { applicationCommandId: 'created-1' } });
	});

	it('edits existing commands when name/description/options changed', async () => {
		commandFetch.mockResolvedValue(new Map([['cmd-1', { id: 'cmd-1', name: '옛이름', description: '옛설명', options: [] }]]));
		await withRows({ id: 'row-1', name: '인사', description: '새 설명', applicationCommandId: 'cmd-1', spec: textSpec });
		await syncGuildSlashCommands('guild-1', logger);
		expect(commandEdit).toHaveBeenCalledWith('cmd-1', {
			name: '인사',
			description: '새 설명',
			options: [expect.objectContaining({ name: 'argument1' })]
		});
		expect(commandCreate).not.toHaveBeenCalled();
	});

	it('deletes stale commands that belong to neither the DB rows nor the core command names', async () => {
		commandFetch.mockResolvedValue(
			new Map([
				['cmd-core', { id: 'cmd-core', name: 'ping', description: 'core', options: [] }],
				['cmd-mine', { id: 'cmd-mine', name: '인사', description: '인사', options: [] }],
				['cmd-stale', { id: 'cmd-stale', name: '지워진명령어', description: 'stale', options: [] }]
			])
		);
		await withRows({ id: 'row-1', name: '인사', description: '인사', applicationCommandId: 'cmd-mine', spec: textSpec });
		await syncGuildSlashCommands('guild-1', logger);
		expect(commandDelete).toHaveBeenCalledWith('cmd-stale');
		expect(commandDelete).toHaveBeenCalledTimes(1);
	});

	it('warns when the guild exceeds the slash slot cap', async () => {
		const many = Array.from({ length: 21 }, (_, index) => ({
			id: `row-${index}`,
			name: `명령${index}`,
			description: 'd',
			spec: { version: 2, steps: [{ type: 'pin_message' }] }
		}));
		findMany.mockResolvedValue(many);
		await syncGuildSlashCommands('guild-1', logger);
		expect(logger.warn).toHaveBeenCalled();
	});
});
