import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setConfigForTesting } from '../../../../lib/config.ts';
import { makeTestConfig } from '../../../../lib/config.testing.ts';
import type { Guild } from '@sirubot/prisma';
import { ComponentType } from 'discord.js';
import { settingsId } from '../customIds.ts';
import { musicNavDescription } from '../settings/core.ts';
import { MUSIC_SUBPAGES, type SettingsScreen } from '../settings/types.ts';
import { settingsView } from './settings.ts';

const GUILD = {
	volume: 100,
	repeat: 'off',
	related: false,
	enableController: true,
	gaplessEnabled: true,
	normalizationEnabled: false,
	crossfadeMs: 4000,
	automixEnabled: true,
	automixMaxTempoChange: 0.06,
	automixMinConfidence: 0.5,
	ttsAnnounceMode: 'queue',
	sponsorBlockSegments: ['sponsor', 'intro'],
	djRoleId: '123',
	aiMode: 'off',
	aiChannelIds: [],
	disabledModules: [],
	embedFixSites: [],
	jtcTemplate: '{user}',
	jtcUserLimit: 0
} as unknown as Guild;

interface Json {
	type: number;
	custom_id?: string;
	components?: Json[];
	options?: Array<{ value: string; label: string; description?: string; default?: boolean }>;
}

const rows = (screen: SettingsScreen) =>
	(settingsView(GUILD, screen).toJSON().components as unknown as Json[]).filter((c) => c.type === ComponentType.ActionRow);

const countAll = (c: Json): number => 1 + (c.components ?? []).reduce((n, child) => n + countAll(child), 0);

describe('settings 뷰: 음악 하위 이동', () => {
	beforeEach(() => setConfigForTesting(makeTestConfig()));
	afterEach(() => setConfigForTesting(null));

	it('첫 화면 이동 셀렉트는 5개 항목이고 음악이 첫 번째예요', () => {
		const nav = rows('main')[0].components![0];
		expect(nav.options!.map((o) => o.value)).toEqual(['music', 'channel', 'jtc', 'ai', 'chatTools']);
		expect(nav.options![0].label).toBe('음악');
		expect(nav.options!.every((o) => (o.description ?? '').length <= 100)).toBe(true);
	});

	it.each(MUSIC_SUBPAGES)('%s 화면은 하위 이동 셀렉트에 현재 화면이 선택돼 있고 행이 5개 이하예요', (screen) => {
		const view = settingsView(GUILD, screen).toJSON();
		const actionRows = (view.components as unknown as Json[]).filter((c) => c.type === ComponentType.ActionRow);
		const nav = actionRows[0].components![0];
		expect(nav.custom_id).toBe(settingsId.encode('navigate'));
		expect(nav.options!.map((o) => o.value)).toEqual([...MUSIC_SUBPAGES]);
		expect(nav.options!.filter((o) => o.default).map((o) => o.value)).toEqual([screen]);
		expect(actionRows.length).toBeLessThanOrEqual(5);
		expect(countAll(view as unknown as Json)).toBeLessThanOrEqual(40);
		const last = actionRows.at(-1)!.components!;
		expect(last.some((c) => c.custom_id === settingsId.encode('back'))).toBe(true);
	});

	it('음악 외 화면에는 하위 이동 줄이 없어요', () => {
		for (const screen of ['channel', 'jtc', 'ai', 'chatTools'] as const) {
			const values = rows(screen).flatMap((r) => r.components!.flatMap((c) => c.options?.map((o) => o.value) ?? []));
			expect(values).not.toContain('sponsorblock');
		}
	});

	it('audio 화면의 버튼 4개는 한 줄에 놓여요', () => {
		const buttonRows = rows('audio').filter((r) => r.components![0].type === ComponentType.Button && r.components!.length > 1);
		expect(buttonRows[0].components).toHaveLength(4);
	});
});

describe('musicNavDescription', () => {
	it('곡 전환·갭리스·DJ·스폰서블록을 한 줄로 요약해요 (100자 이하)', () => {
		const text = musicNavDescription(GUILD);
		expect(text).toContain('갭리스 켜짐');
		expect(text).toContain('DJ 설정됨');
		expect(text).toContain('스폰서블록 2개 구간');
		expect(text.length).toBeLessThanOrEqual(100);
	});

	it('꺼진 상태도 요약해요', () => {
		const text = musicNavDescription({ ...GUILD, gaplessEnabled: false, djRoleId: null, sponsorBlockSegments: [] } as unknown as Guild);
		expect(text).toContain('갭리스 꺼짐');
		expect(text).toContain('DJ 미설정');
		expect(text).toContain('스폰서블록 꺼짐');
	});
});
