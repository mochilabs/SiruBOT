import { describe, expect, it } from 'vitest';
import { ComponentType } from 'discord.js';
import { DEFAULT_COLOR } from '@sirubot/utils';
import type { GreetingMessageInput } from '../application/memberGreetingService.ts';
import { greetingMessages } from './greetingMessages.ts';

describe('greetingMessages — 메시지 레이아웃', () => {
	function render(overrides: Partial<GreetingMessageInput>, isTest = false) {
		const parts = greetingMessages.components({
			kind: 'welcome',
			isTest,
			content: '@everyone <@member-1>님 환영해요!',
			imageFilename: null,
			avatarUrl: null,
			layout: 'container',
			accentColor: null,
			...overrides
		});
		return (parts as { toJSON(): unknown }[]).map((component) => component.toJSON() as Record<string, unknown>);
	}

	it('container 레이아웃은 컴포넌트를 컨테이너 1개에 담아 보낸다', () => {
		const components = render({ layout: 'container' });
		expect(components).toHaveLength(1);
		expect(components[0]!.type).toBe(ComponentType.Container);
	});

	it('components 레이아웃은 컨테이너 없이 컴포넌트 목록을 그대로 보낸다', () => {
		// isTest일 때 안내 문구 + 구분선이 붙어 조각이 2개 이상이 돼요
		const components = render({ layout: 'components' }, true);
		expect(components.length).toBeGreaterThan(1);
		expect(components.some((component) => component.type === ComponentType.Container)).toBe(false);
		expect(components[0]!.type).toBe(ComponentType.TextDisplay);
	});

	it('container 레이아웃의 기본 강조색은 봇 기본색이다', () => {
		const components = render({ layout: 'container', accentColor: null });
		expect(components[0]!.accent_color).toBe(DEFAULT_COLOR);
	});

	it('container 레이아웃에서 강조색을 지정하면 그 색을 쓴다', () => {
		const components = render({ layout: 'container', accentColor: '#123456' });
		expect(components[0]!.accent_color).toBe(0x123456);
	});
});
