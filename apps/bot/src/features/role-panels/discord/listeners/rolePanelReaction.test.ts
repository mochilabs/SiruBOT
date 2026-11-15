import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findReactionPanel: vi.fn(),
	applyRole: vi.fn(),
	logger: { warn: vi.fn() }
}));

vi.mock('@sapphire/framework', () => ({
	container: { rolePanelService: { findReactionPanel: mocks.findReactionPanel, applyRole: mocks.applyRole }, logger: mocks.logger },
	Events: { MessageReactionAdd: 'messageReactionAdd', MessageReactionRemove: 'messageReactionRemove' },
	Listener: class {}
}));
vi.mock('@sapphire/decorators', () => ({ ApplyOptions: () => (target: unknown) => target }));

import { RolePanelReactionAddListener, RolePanelReactionRemoveListener } from './rolePanelReaction.ts';

const GUILD = '100000000000000001';
const MESSAGE = '900000000000000001';
const USER = '500000000000000001';
const ROLE = '300000000000000001';

function setup(emojiName = '🎮') {
	const usersRemove = vi.fn().mockResolvedValue(undefined);
	const member = { id: USER };
	const send = vi.fn().mockResolvedValue(undefined);
	const reaction = {
		partial: false,
		emoji: { id: null, name: emojiName },
		users: { remove: usersRemove },
		message: {
			partial: false,
			id: MESSAGE,
			guildId: GUILD,
			guild: { id: GUILD, name: 'g', members: { fetch: vi.fn().mockResolvedValue(member) } }
		}
	};
	const user = { id: USER, bot: false, send };
	return { reaction, user, usersRemove, send, member };
}

const panel = { id: 'panel-1', buttons: [{ emoji: '🎮', roleId: ROLE }] };

describe('rolePanelReaction 리스너', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findReactionPanel.mockResolvedValue(panel);
		mocks.applyRole.mockResolvedValue({ ok: true, added: true, changed: true });
	});

	const add = (s: ReturnType<typeof setup>) =>
		new (RolePanelReactionAddListener as never as new () => RolePanelReactionAddListener)().run(s.reaction as never, s.user as never);
	const remove = (s: ReturnType<typeof setup>) =>
		new (RolePanelReactionRemoveListener as never as new () => RolePanelReactionRemoveListener)().run(s.reaction as never, s.user as never);

	it('반응 추가 → DB 매핑의 roleId로 grant', async () => {
		const s = setup();
		await add(s);
		expect(mocks.applyRole).toHaveBeenCalledWith(s.reaction.message.guild, s.member, 'panel-1', ROLE, 'grant');
	});

	it('반응 제거 → revoke', async () => {
		const s = setup();
		await remove(s);
		expect(mocks.applyRole).toHaveBeenCalledWith(s.reaction.message.guild, s.member, 'panel-1', ROLE, 'revoke');
	});

	it('봇의 반응은 무시한다', async () => {
		const s = setup();
		s.user.bot = true;
		await add(s);
		expect(mocks.findReactionPanel).not.toHaveBeenCalled();
	});

	it('반응 패널이 아닌 메시지는 무시한다', async () => {
		mocks.findReactionPanel.mockResolvedValue(null);
		const s = setup();
		await add(s);
		expect(mocks.applyRole).not.toHaveBeenCalled();
	});

	it('패널에 없는 이모지는 반응을 치우고 역할은 건드리지 않는다', async () => {
		const s = setup('🔥');
		await add(s);
		expect(s.usersRemove).toHaveBeenCalledWith(USER);
		expect(mocks.applyRole).not.toHaveBeenCalled();
	});

	it('부여에 실패하면 반응을 치우고 DM으로 사유를 알린 뒤, 이어지는 제거 이벤트로 역할을 건드리지 않는다', async () => {
		mocks.applyRole.mockResolvedValueOnce({ ok: false, reason: '부여할 수 없어요' });
		const s = setup();
		await add(s);
		expect(s.usersRemove).toHaveBeenCalledWith(USER);
		expect(s.send).toHaveBeenCalledOnce();
		mocks.applyRole.mockClear();
		await remove(s);
		expect(mocks.applyRole).not.toHaveBeenCalled();
	});
});
