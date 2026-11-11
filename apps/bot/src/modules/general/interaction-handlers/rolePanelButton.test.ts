import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getButton: vi.fn(),
	toggleRole: vi.fn()
}));

vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		public container = { rolePanelService: { getButton: mocks.getButton, toggleRole: mocks.toggleRole } };
		public none() {
			return null;
		}
		public some(value: unknown) {
			return value;
		}
	},
	InteractionHandlerTypes: { Button: 'Button' }
}));
vi.mock('@sirubot/utils', () => ({ emoji: (name: string) => `:${name}:` }));
vi.mock('../../../features/tickets/index.ts', () => ({ ticketMessageView: (text: string) => ({ text }) }));

import RolePanelButtonHandler from './rolePanelButton.ts';

const GUILD = '100000000000000001';
const MESSAGE = '900000000000000001';
const ROLE = '300000000000000001';

function interaction() {
	return {
		guild: { id: GUILD },
		message: { id: MESSAGE },
		member: {},
		reply: vi.fn(),
		deferReply: vi.fn(),
		editReply: vi.fn()
	};
}

function button(over: Record<string, unknown> = {}) {
	return { id: 'b1', panelId: 'p1', roleId: ROLE, panel: { guildId: GUILD, messageId: MESSAGE }, ...over };
}

async function run(i: ReturnType<typeof interaction>) {
	const handler = new (RolePanelButtonHandler as never as new (ctx: unknown, opts: unknown) => RolePanelButtonHandler)({}, {});
	await handler.run(i as never, { buttonId: 'b1', roleId: ROLE });
}

describe('RolePanelButtonHandler.run', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.toggleRole.mockResolvedValue({ ok: true, added: true });
	});

	it.each([
		['버튼이 없다', null],
		['다른 길드의 패널이다', button({ panel: { guildId: '200000000000000002', messageId: MESSAGE } })],
		['현재 게시 메시지가 아닌 옛 메시지다', button({ panel: { guildId: GUILD, messageId: '800000000000000002' } })],
		['customId의 roleId가 DB와 다르다', button({ roleId: '400000000000000004' })]
	])('%s → 거부하고 역할을 건드리지 않는다', async (_label, found) => {
		mocks.getButton.mockResolvedValue(found);
		const i = interaction();
		await run(i);
		expect(i.reply).toHaveBeenCalledOnce();
		expect(mocks.toggleRole).not.toHaveBeenCalled();
	});

	it('모두 일치하면 DB 버튼의 roleId로 토글한다', async () => {
		mocks.getButton.mockResolvedValue(button());
		const i = interaction();
		await run(i);
		expect(mocks.toggleRole).toHaveBeenCalledWith(i.guild, i.member, 'p1', ROLE);
		expect(i.editReply).toHaveBeenCalledOnce();
	});
});
