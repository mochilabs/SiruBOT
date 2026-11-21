import { ComponentType, type APIActionRowComponent, type APIButtonComponent } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@sapphire/framework', () => ({ UserError: class UserError extends Error {} }));

import { botInfoView } from './botInfo.ts';

const stats = {
	guilds: 1,
	users: 2,
	players: 0,
	channels: 3,
	heapUsedMB: '1',
	heapTotalMB: '2',
	uptimeStr: '1분',
	shardInfo: '샤딩 없음',
	latency: 5
};

function buttons(links?: { dashboardUrl: string | null; supportServerUrl: string | null }): APIButtonComponent[] {
	const view = links ? botInfoView(stats, links) : botInfoView(stats);
	const row = view.toJSON().components.find((c) => c.type === ComponentType.ActionRow) as APIActionRowComponent<APIButtonComponent> | undefined;
	return row?.components ?? [];
}

describe('botInfoView 링크 버튼', () => {
	it('링크가 없으면 버튼 행이 없어요', () => {
		expect(buttons()).toEqual([]);
		expect(buttons({ dashboardUrl: null, supportServerUrl: null })).toEqual([]);
	});

	it('대시보드 주소가 있으면 상태 페이지(/shards) 버튼이 붙어요', () => {
		expect(buttons({ dashboardUrl: 'https://siru.example', supportServerUrl: null })).toMatchObject([
			{ label: '상태 페이지', url: 'https://siru.example/shards' }
		]);
	});

	it('둘 다 있으면 상태 페이지와 지원 서버 버튼이에요', () => {
		const result = buttons({ dashboardUrl: 'https://siru.example', supportServerUrl: 'https://discord.gg/abc' });
		expect(result.map((b) => ('label' in b ? b.label : ''))).toEqual(['상태 페이지', '지원 서버']);
	});
});
