import type { RolePanel, RolePanelButton } from '@sirubot/prisma';
import { describe, expect, it } from 'vitest';
import { rolePanelMessages } from './rolePanelMessages.ts';
import { rolePanelView } from './views/rolePanel.ts';

describe('rolePanelMessages (Discord 렌더링)', () => {
	it('panel은 역할 패널 뷰와 같은 메시지를 만들고 버튼 행을 컨테이너 안에 넣어요', () => {
		const panel = { id: '300000000000000001', title: '역할 받기', mode: 'button', description: null, clickCount: 0 } as unknown as RolePanel;
		const buttons = [
			{ id: '100000000000000001', roleId: '200000000000000001', label: '손님', emoji: null, style: 'primary', position: 0 }
		] as unknown as RolePanelButton[];
		const payload = rolePanelMessages.panel(panel, buttons);
		expect(JSON.stringify(payload)).toBe(JSON.stringify(rolePanelView(panel, buttons)));
		expect(payload.components).toHaveLength(1);
		const containerJson = JSON.parse(JSON.stringify(payload.components?.[0])) as {
			components?: Array<{ type: number }>;
		};
		expect(containerJson.components?.some((c) => c.type === 1)).toBe(true);
		expect(JSON.stringify(payload)).toContain('역할 받기');
	});

	it('imageUrl이 있으면 컨테이너 안에 미디어 갤러리를 포함해요', () => {
		const panel = {
			id: '300000000000000002',
			title: '역할 받기',
			mode: 'button',
			description: '원하는 역할을 선택하세요.',
			imageUrl: 'https://cdn.example.com/banner.png',
			clickCount: 0
		} as unknown as RolePanel;
		const payload = rolePanelMessages.panel(panel, []);
		expect(JSON.stringify(payload)).toContain('https://cdn.example.com/banner.png');
	});
});
