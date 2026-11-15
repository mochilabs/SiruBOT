import { describe, expect, it, vi } from 'vitest';
import { createMemberGreetingService } from './memberGreetingService.ts';
import type { GreetingConfig, GreetingKind } from '@sirubot/utils';

const { channelSend, getGuild, components } = vi.hoisted(() => ({
	channelSend: vi.fn(async (_payload: unknown) => undefined),
	getGuild: vi.fn(),
	components: vi.fn((_input: unknown) => [{ fake: true }])
}));

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
		layout: 'container',
		accentColor: null,
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
	return createMemberGreetingService({
		logger,
		signingKey: '',
		publisher: { publish: vi.fn() },
		getPendingStore: () => undefined,
		getGuild,
		getGuildSettings: vi.fn(),
		renderMemberCard: vi.fn(async () => null),
		messages: { components: components as never }
	});
}

async function sendGreeting(kind: GreetingKind = 'welcome') {
	getGuild.mockReturnValue(fakeGuild());
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

describe('MemberGreetingService.send — 렌더링 포트 호출', () => {
	it('렌더링 포트에 치환된 본문·레이아웃·강조색을 넘기고 결과를 그대로 전송한다', async () => {
		getGuild.mockReturnValue(fakeGuild());
		channelSend.mockClear();
		components.mockClear();
		const result = await makeService().send('guild-1', 'goodbye', member, 42, config({ layout: 'components', accentColor: '#123456' }), {
			isTest: true
		});
		expect(result.ok).toBe(true);
		expect(components).toHaveBeenCalledWith({
			kind: 'goodbye',
			isTest: true,
			content: '@everyone <@member-1>님 환영해요!',
			imageFilename: null,
			avatarUrl: null,
			layout: 'components',
			accentColor: '#123456'
		});
		const payload = channelSend.mock.calls[0]![0] as { components: unknown; files: unknown[] };
		expect(payload.components).toEqual([{ fake: true }]);
		expect(payload.files).toEqual([]);
	});
});
