import type { RolePanel, RolePanelButton } from '@sirubot/prisma';
import { describe, expect, it } from 'vitest';
import { rolePanelMessages } from './rolePanelMessages.ts';
import { rolePanelView } from './views/rolePanel.ts';

describe('rolePanelMessages (Discord 렌더링)', () => {
	it('panel은 역할 패널 뷰와 같은 메시지를 만들어요', () => {
		const panel = { id: '300000000000000001', title: '역할 받기', mode: 'button', description: null, clickCount: 0 } as unknown as RolePanel;
		const buttons = [
			{ id: '100000000000000001', roleId: '200000000000000001', label: '손님', emoji: null, style: 'primary', position: 0 }
		] as unknown as RolePanelButton[];
		const payload = rolePanelMessages.panel(panel, buttons);
		expect(JSON.stringify(payload)).toBe(JSON.stringify(rolePanelView(panel, buttons)));
		expect(JSON.stringify(payload)).toContain('역할 받기');
	});
});
