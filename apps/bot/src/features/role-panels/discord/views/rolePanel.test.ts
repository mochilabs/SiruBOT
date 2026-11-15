import { describe, expect, it } from 'vitest';
import type { RolePanel, RolePanelButton } from '@sirubot/prisma';
import { rolePanelView } from './rolePanel.ts';

const TYPE = { actionRow: 1, section: 9, text: 10, thumbnail: 11, gallery: 12, separator: 14 } as const;

const panel = (overrides: Partial<RolePanel> = {}): RolePanel => ({
	id: 'panel-1',
	guildId: '100000000000000001',
	name: '관심사',
	title: '관심사 역할',
	description: '버튼을 눌러 역할을 받아요.',
	imageUrl: 'https://example.com/banner.png',
	imageLayout: 'gallery',
	imagePosition: 'middle',
	accentColor: null,
	mode: 'button',
	clickCount: 0,
	channelId: null,
	messageId: null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
	...overrides
});

const buttons: RolePanelButton[] = [
	{
		id: '00000000-0000-4000-8000-000000000001',
		panelId: 'panel-1',
		roleId: '300000000000000001',
		label: '게이머',
		emoji: null,
		style: 'primary',
		position: 0
	}
];

const types = (overrides?: Partial<RolePanel>) => {
	const { components } = rolePanelView(panel(overrides), buttons);
	return components[0].toJSON().components.map((component) => component.type);
};

describe('rolePanelView 이미지 레이아웃', () => {
	it('기본(갤러리, 안내문 아래)은 기존 순서를 유지해요', () => {
		expect(types()).toEqual([TYPE.text, TYPE.separator, TYPE.text, TYPE.separator, TYPE.gallery, TYPE.separator, TYPE.actionRow]);
	});

	it('갤러리를 맨 위에 둘 수 있어요', () => {
		expect(types({ imagePosition: 'top' })).toEqual([
			TYPE.gallery,
			TYPE.separator,
			TYPE.text,
			TYPE.separator,
			TYPE.text,
			TYPE.separator,
			TYPE.actionRow
		]);
	});

	it('갤러리를 버튼 아래에 둘 수 있어요', () => {
		expect(types({ imagePosition: 'bottom' })).toEqual([
			TYPE.text,
			TYPE.separator,
			TYPE.text,
			TYPE.separator,
			TYPE.actionRow,
			TYPE.separator,
			TYPE.gallery
		]);
	});

	it('섬네일은 제목·안내문과 한 Section으로 묶여요', () => {
		const { components } = rolePanelView(panel({ imageLayout: 'thumbnail', imagePosition: 'bottom' }), buttons);
		const json = components[0].toJSON().components;
		expect(json.map((component) => component.type)).toEqual([TYPE.section, TYPE.separator, TYPE.actionRow]);
		const section = json[0] as { components: { type: number }[]; accessory: { type: number } };
		expect(section.components.map((component) => component.type)).toEqual([TYPE.text, TYPE.text]);
		expect(section.accessory.type).toBe(TYPE.thumbnail);
	});

	it('강조색을 지정하면 컨테이너 색이 바뀌고, 없으면 봇 기본색이에요', () => {
		const custom = rolePanelView(panel({ accentColor: '#5fb3a1' }), buttons).components[0].toJSON().accent_color;
		const fallback = rolePanelView(panel({ accentColor: null }), buttons).components[0].toJSON().accent_color;
		expect(custom).toBe(0x5fb3a1);
		expect(fallback).not.toBe(0x5fb3a1);
	});

	it('이미지가 없으면 레이아웃 값과 상관없이 이미지 컴포넌트가 없어요', () => {
		expect(types({ imageUrl: null, imageLayout: 'thumbnail' })).toEqual([TYPE.text, TYPE.separator, TYPE.text, TYPE.separator, TYPE.actionRow]);
	});

	it('반응 모드에서도 갤러리 위치를 따라요', () => {
		const top = types({ mode: 'reaction', imagePosition: 'top' });
		const bottom = types({ mode: 'reaction', imagePosition: 'bottom' });
		expect(top[0]).toBe(TYPE.gallery);
		expect(bottom.at(-1)).toBe(TYPE.gallery);
	});
});
