import { describe, expect, it, vi } from 'vitest';
import { ComponentType } from 'discord.js';

import { MemberGreetingService } from './memberGreetingService.ts';
import { DEFAULT_COLOR } from '@sirubot/utils';
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

describe('MemberGreetingService.send — 메시지 레이아웃', () => {
	async function sendWith(overrides: Partial<GreetingConfig>, isTest = false) {
		containerMock.client.guilds.cache.get.mockReturnValue(fakeGuild());
		channelSend.mockClear();
		const result = await makeService().send('guild-1', 'welcome', member, 42, config(overrides), { isTest });
		expect(result.ok).toBe(true);
		const payload = channelSend.mock.calls[0]![0] as { components: { toJSON(): unknown }[] };
		return payload.components.map((component) => component.toJSON() as Record<string, unknown>);
	}

	it('container 레이아웃은 컴포넌트를 컨테이너 1개에 담아 보낸다', async () => {
		const components = await sendWith({ layout: 'container' });
		expect(components).toHaveLength(1);
		expect(components[0]!.type).toBe(ComponentType.Container);
	});

	it('components 레이아웃은 컨테이너 없이 컴포넌트 목록을 그대로 보낸다', async () => {
		// isTest일 때 안내 문구 + 구분선이 붙어 조각이 2개 이상이 돼요
		const components = await sendWith({ layout: 'components' }, true);
		expect(components.length).toBeGreaterThan(1);
		expect(components.some((component) => component.type === ComponentType.Container)).toBe(false);
		expect(components[0]!.type).toBe(ComponentType.TextDisplay);
	});

	it('container 레이아웃의 기본 강조색은 봇 기본색이다', async () => {
		const components = await sendWith({ layout: 'container', accentColor: null });
		expect(components[0]!.accent_color).toBe(DEFAULT_COLOR);
	});

	it('container 레이아웃에서 강조색을 지정하면 그 색을 쓴다', async () => {
		const components = await sendWith({ layout: 'container', accentColor: '#123456' });
		expect(components[0]!.accent_color).toBe(0x123456);
	});
});
