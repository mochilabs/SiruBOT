import { describe, expect, it, vi } from 'vitest';

vi.mock('@sapphire/framework', () => ({
	container: {
		client: { guilds: { cache: new Map() } },
		redisStore: null
	}
}));

import { mapGuildMemberToItem } from './guildDataResponder.ts';

function member(overrides: Record<string, unknown> = {}) {
	return {
		id: '444444444444444444',
		nickname: '별명',
		user: { username: 'account', globalName: '글로벌' },
		displayAvatarURL: vi.fn(() => 'https://cdn.discordapp.com/avatars/1/2.png?size=64'),
		...overrides
	};
}

describe('mapGuildMemberToItem', () => {
	it('서버 별명을 표시 이름으로 우선 사용해요', () => {
		const item = mapGuildMemberToItem(member());
		expect(item).toEqual({
			id: '444444444444444444',
			displayName: '별명',
			username: 'account',
			avatarUrl: 'https://cdn.discordapp.com/avatars/1/2.png?size=64'
		});
	});

	it('별명이 없으면 전역 표시 이름으로 폴백해요', () => {
		const item = mapGuildMemberToItem(member({ nickname: null }));
		expect(item.displayName).toBe('글로벌');
	});

	it('별명·전역 이름이 모두 없으면 계정 사용자명으로 폴백해요', () => {
		const item = mapGuildMemberToItem(member({ nickname: null, user: { username: 'account', globalName: null } }));
		expect(item.displayName).toBe('account');
	});

	it('아바타는 size 64로 요청해요', () => {
		const displayAvatarURL = vi.fn(() => 'https://cdn.discordapp.com/avatars/9/9.png?size=64');
		const item = mapGuildMemberToItem(member({ displayAvatarURL }));
		expect(displayAvatarURL).toHaveBeenCalledWith({ size: 64 });
		expect(item.avatarUrl).toBe('https://cdn.discordapp.com/avatars/9/9.png?size=64');
	});
});
