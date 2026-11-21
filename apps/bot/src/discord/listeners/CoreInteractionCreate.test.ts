import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getGuild, record, run, warn } = vi.hoisted(() => ({
	getGuild: vi.fn(async () => ({ disabledModules: [] as string[] })),
	record: vi.fn(),
	run: vi.fn(async () => true),
	warn: vi.fn()
}));

vi.mock('@sapphire/framework', () => ({
	Events: {
		InteractionCreate: 'interactionCreate',
		PossibleChatInputCommand: 'possibleChatInputCommand',
		PossibleContextMenuCommand: 'possibleContextMenuCommand',
		PossibleAutocompleteInteraction: 'possibleAutocompleteInteraction'
	},
	Listener: class {
		container = {
			guildService: { getGuild },
			stores: { get: () => ({ run }) },
			client: { emit: vi.fn() },
			logger: { warn }
		};
		location = { name: 'CoreInteractionCreate' };
	},
	container: { usageRecorder: { record }, logger: { warn } }
}));
vi.mock('../../lib/customId.ts', () => ({ customIdNamespace: (id: string) => id.split(':')[0] || null }));
vi.mock('../../lib/notice.ts', () => ({ notice: (message: string) => ({ message }) }));

import { CoreInteractionCreate } from './CoreInteractionCreate.ts';

function component(customId: string) {
	return {
		customId,
		guildId: 'g1',
		user: { id: 'u1' },
		isChatInputCommand: () => false,
		isContextMenuCommand: () => false,
		isAutocomplete: () => false,
		isMessageComponent: () => true,
		isModalSubmit: () => false,
		reply: vi.fn(async () => undefined)
	};
}

const listener = () => new CoreInteractionCreate({} as never, {} as never);

describe('CoreInteractionCreate 모듈 꺼짐 검사', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getGuild.mockResolvedValue({ disabledModules: [] });
	});

	it('켜진 모듈의 컴포넌트는 핸들러로 넘기고 지표를 세요', async () => {
		const interaction = component('game:v1:play');
		await listener().run(interaction as never);
		expect(run).toHaveBeenCalledWith(interaction);
		expect(record).toHaveBeenCalledWith('g1', 'ns:game', 'u1');
	});

	it('꺼진 모듈의 컴포넌트는 핸들러를 부르지 않고 ephemeral로 거절하며 지표도 세지 않아요', async () => {
		getGuild.mockResolvedValue({ disabledModules: ['fun'] });
		const interaction = component('game:v1:play');
		await listener().run(interaction as never);
		expect(run).not.toHaveBeenCalled();
		expect(record).not.toHaveBeenCalled();
		expect(JSON.stringify(interaction.reply.mock.calls)).toContain('놀이 기능이 꺼져 있어요');
	});

	it('도움말 컴포넌트는 모듈이 꺼져 있어도 통과해요', async () => {
		getGuild.mockResolvedValue({ disabledModules: ['utility'] });
		const interaction = component('help:v1:category');
		await listener().run(interaction as never);
		expect(run).toHaveBeenCalledWith(interaction);
	});
});
