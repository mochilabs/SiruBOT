import { describe, expect, it, vi } from 'vitest';

import { MemberGreetingService } from './memberGreetingService.ts';
import type { GreetingConfig, GreetingKind } from '@sirubot/utils';

const { channelSend, containerMock } = vi.hoisted(() => {
	const channelSend = vi.fn(async (_payload: unknown) => undefined);
	const containerMock = { client: { guilds: { cache: { get: vi.fn() } } } };
	return { channelSend, containerMock };
});

vi.mock('@sapphire/framework', () => ({ container: containerMock }));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function fakeGuild() {
	const channel = {
		isSendable: () => true,
		permissionsFor: () => ({ has: () => true }),
		send: channelSend
	};
	return {
		name: '테스트길드',
		memberCount: 42,
		channels: { cache: { get: () => channel } },
		members: { fetchMe: async () => ({ id: 'bot-1' }) }
	};
}

function config(overrides: Partial<GreetingConfig> = {}): GreetingConfig {
	return {
		version: 2,
		enabled: true,
		channelId: 'channel-1',
		template: '@everyone {유저}님 환영해요!',
		useImage: false,
		image: null,
		...overrides
	};
}

const member = {
	user: { id: 'member-1', username: 'tester' },
	displayName: 'Tester',
	mention: '<@member-1>',
	avatarUrl: null
};

function makeService() {
	return new MemberGreetingService(logger);
}

async function sendGreeting(kind: GreetingKind = 'welcome') {
	containerMock.client.guilds.cache.get.mockReturnValue(fakeGuild());
	channelSend.mockClear();
	const result = await makeService().send('guild-1', kind, member, 42, config(), { isTest: false });
	return result;
}

describe('MemberGreetingService.send', () => {
	it('인사 메시지는 everything/here/역할 멘션을 막고 대상 멤버만 핑한다', async () => {
		const result = await sendGreeting();
		expect(result.ok).toBe(true);
		expect(channelSend).toHaveBeenCalledTimes(1);
		const payload = channelSend.mock.calls[0]![0] as { allowedMentions?: unknown };
		expect(payload.allowedMentions).toEqual({ parse: [], users: ['member-1'] });
	});

	it('작별 메시지에도 동일한 멘션 규칙을 적용한다', async () => {
		const result = await sendGreeting('goodbye');
		expect(result.ok).toBe(true);
		const payload = channelSend.mock.calls[0]![0] as { allowedMentions?: unknown };
		expect(payload.allowedMentions).toEqual({ parse: [], users: ['member-1'] });
	});
});
