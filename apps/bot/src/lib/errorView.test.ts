import { ComponentType, type APIActionRowComponent, type APIButtonComponent } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@sapphire/framework', () => ({ UserError: class UserError extends Error {} }));

import { errorView } from './errorView.ts';

function buttons(view: ReturnType<typeof errorView>): APIButtonComponent[] {
	const row = view.toJSON().components.find((c) => c.type === ComponentType.ActionRow) as APIActionRowComponent<APIButtonComponent> | undefined;
	return row?.components ?? [];
}

describe('errorView 지원 서버 버튼', () => {
	it('지원 서버 URL이 없으면 버튼이 없어요', () => {
		expect(buttons(errorView('오류예요.'))).toEqual([]);
		expect(buttons(errorView('오류예요.', { supportUrl: null }))).toEqual([]);
	});

	it('URL이 있으면 지원 서버 링크 버튼이 하나 붙어요', () => {
		const [button] = buttons(errorView('오류예요.', { supportUrl: 'https://discord.gg/abc' }));
		expect(button).toMatchObject({ label: '지원 서버', url: 'https://discord.gg/abc' });
	});
});
