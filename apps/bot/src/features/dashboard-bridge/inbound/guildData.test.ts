import { describe, expect, it, vi } from 'vitest';

vi.mock('@sapphire/framework', () => ({
	container: {
		client: { guilds: { cache: new Map() } },
		redisStore: null
	}
}));

import { createGuildDataResponder, mapGuildMemberToItem } from './guildData.ts';

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

describe('길드 데이터 응답자', () => {
	const REQUEST_ID = 'c9d3a1b2-4e5f-4a6b-8c7d-2b1e3f4a5c61';
	const run = async (kind: 'channels' | 'roles') => {
		const publish = vi.fn();
		const guild = {
			id: '123',
			channels: { cache: new Map([['c1', { id: 'c1', name: '일반', type: 0, parentId: null, position: 2 }]]) },
			roles: { cache: new Map([['r1', { id: 'r1', name: '역할', color: 5, position: 1, managed: false }]]) }
		};
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
		await createGuildDataResponder().handle(JSON.stringify({ requestId: REQUEST_ID, guildId: '123', kind }), {
			logger,
			signingKey: '',
			publisher: { publish },
			resolveGuild: (id) => (id === '123' ? (guild as never) : undefined)
		});
		return publish.mock.calls[0];
	};

	it('channels 요청은 채널 목록을 같은 requestId·kind로 응답해요', async () => {
		const [channel, body] = (await run('channels'))!;
		expect(channel).toBe('sirubot:guild-data:response');
		expect(body).toEqual({
			requestId: REQUEST_ID,
			guildId: '123',
			kind: 'channels',
			channels: [{ id: 'c1', name: '일반', type: 0, parentId: null, position: 2 }]
		});
	});

	it('roles 요청은 역할 목록을 응답해요', async () => {
		const [, body] = (await run('roles'))!;
		expect(body).toEqual({
			requestId: REQUEST_ID,
			guildId: '123',
			kind: 'roles',
			roles: [{ id: 'r1', name: '역할', color: 5, position: 1, managed: false }]
		});
	});
});
