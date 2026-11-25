import { describe, expect, it, vi } from 'vitest';

vi.mock('@sirubot/utils', async () => {
	const actual = await vi.importActual<typeof import('@sirubot/utils')>('@sirubot/utils');
	return { ...actual, emoji: (name: string) => `:${name}:` };
});

import { panelIdleView, type PanelIdleOptions } from './panelIdle.ts';

const base: PanelIdleOptions = {
	inputPlay: false,
	inputMode: 'play',
	deleteInput: false,
	djRoleId: null,
	recent: [],
	dashboardUrl: null,
	guildId: '123'
};

const json = (options: Partial<PanelIdleOptions>) => JSON.stringify(panelIdleView({ ...base, ...options }).toJSON());

describe('panelIdleView', () => {
	it('최근 곡이 없으면 셀렉트 없이 플레이리스트 버튼만 보여요', () => {
		const out = json({});
		expect(out).not.toContain('최근 곡 다시 재생');
		expect(out).toContain('내 플레이리스트 불러오기');
	});

	it('최근 곡이 있으면 셀렉트 값에 Track id를 담아요', () => {
		const out = json({ recent: [{ id: 'track-1', title: '곡', artist: '가수', url: 'https://x' }] });
		expect(out).toContain('최근 곡 다시 재생');
		expect(out).toContain('track-1');
	});

	it('대시보드 URL이 있을 때만 링크 버튼을 보여요', () => {
		expect(json({})).not.toContain('대시보드 열기');
		expect(json({ dashboardUrl: 'https://d.example' })).toContain('https://d.example/servers/123');
	});

	it('입력 재생 상태에 맞는 안내를 보여요', () => {
		expect(json({ inputPlay: true })).toContain('곡 제목이나 링크');
		expect(json({ inputPlay: false })).toContain('채팅 입력 재생');
	});
});
