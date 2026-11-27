import { BOT_MODULES } from '@sirubot/utils/modules';
import type { APIContainerComponent, APIStringSelectComponent, APITextDisplayComponent } from 'discord.js';
import { ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { collectPieces } from '../../core/pieceScan.testing.ts';
import { helpId } from '../customIds.ts';
import { HELP_HOME, helpView, parseHelpPage } from '../views/help.ts';
import { HELP_COMMAND_SUMMARIES, helpCategoryLines, visibleHelpModules, type HelpContext } from './helpCatalog.ts';

const commandPieces = collectPieces().filter((p) => p.key.startsWith('commands:'));
const commandName = (key: string) => key.slice('commands:'.length);
const devCommands = new Set(commandPieces.filter((p) => p.category === '개발').map((p) => commandName(p.key)));
const publicCommands = new Set(commandPieces.filter((p) => p.category !== '개발').map((p) => commandName(p.key)));
const listed = BOT_MODULES.flatMap((m) => m.commands);
const CATALOG_DRAWN = new Set(['music', 'play', 'skip', 'stop']);

const ctx = (overrides: Partial<HelpContext> = {}): HelpContext => ({
	index: new Map(),
	loadedCommands: new Set(listed),
	canManageGuild: false,
	...overrides
});

describe('도움말 카탈로그', () => {
	it('BOT_MODULES의 명령은 전부 실제 command 피스예요', () => {
		expect(listed.filter((name) => !publicCommands.has(name))).toEqual([]);
	});

	it('개발 명령은 도움말에 없어요', () => {
		expect(listed.filter((name) => devCommands.has(name))).toEqual([]);
	});

	it('공개 명령은 모두 어느 카테고리엔가 들어 있어요 (새 명령이 도움말에서 빠지지 않게)', () => {
		expect([...publicCommands].filter((name) => !listed.includes(name)).sort()).toEqual([]);
	});

	it('카탈로그로 그리지 않는 명령은 한국어 설명이 있어요', () => {
		const missing = listed.filter((name) => !CATALOG_DRAWN.has(name) && !HELP_COMMAND_SUMMARIES[name]);
		expect(missing).toEqual([]);
		expect(Object.keys(HELP_COMMAND_SUMMARIES).filter((name) => !listed.includes(name))).toEqual([]);
	});

	it('관리 카테고리는 ManageGuild 권한이 있을 때만 보여요', () => {
		expect(visibleHelpModules(ctx()).map((m) => m.id)).not.toContain('admin');
		expect(visibleHelpModules(ctx({ canManageGuild: true })).map((m) => m.id)).toContain('admin');
		expect(parseHelpPage('admin', ctx())).toBeNull();
		expect(parseHelpPage('admin', ctx({ canManageGuild: true }))).toBe('admin');
		expect(parseHelpPage('nope', ctx())).toBeNull();
	});

	it('서버에서 꺼진 모듈은 카테고리 선택지와 페이지에서 빠지고, 켜면 다시 나와요', () => {
		const off = ctx({ canManageGuild: true, isModuleEnabled: (id) => id !== 'fun' });
		expect(visibleHelpModules(off).map((m) => m.id)).not.toContain('fun');
		expect(visibleHelpModules(off).map((m) => m.id)).toContain('music');
		expect(parseHelpPage('fun', off)).toBeNull();
		const on = ctx({ canManageGuild: true, isModuleEnabled: () => true });
		expect(visibleHelpModules(on).map((m) => m.id)).toContain('fun');
		expect(parseHelpPage('fun', on)).toBe('fun');
	});

	it('로드되지 않은 명령은 목록에서 빠져요', () => {
		const lines = helpCategoryLines('ai', ctx({ loadedCommands: new Set(['emojimaker']) }));
		expect(lines.some((l) => l.includes('/tts'))).toBe(false);
		expect(lines.some((l) => l.includes('/emojimaker'))).toBe(true);
	});

	it('카테고리마다 디스코드 텍스트 한도(4000자) 안이에요', () => {
		for (const m of BOT_MODULES) {
			const body = helpCategoryLines(m.id, ctx({ canManageGuild: true })).join('\n');
			expect(body.length).toBeLessThan(3500);
		}
	});
});

describe('도움말 화면', () => {
	const findSelect = (json: APIContainerComponent): APIStringSelectComponent | undefined => {
		for (const c of json.components) {
			if (c.type === ComponentType.ActionRow) {
				const inner = c.components[0];
				if (inner?.type === ComponentType.StringSelect) return inner;
			}
		}
		return undefined;
	};

	it('셀렉트 customId가 helpId로 되돌아가요', () => {
		const select = findSelect(helpView(HELP_HOME, ctx()).toJSON());
		expect(select).toBeDefined();
		expect(helpId.decode(select!.custom_id)).toEqual({ action: 'category' });
		expect(select!.options.map((o) => o.value)).toEqual([HELP_HOME, 'music', 'community', 'ai', 'fun', 'utility']);
	});

	it('세션이 끝난 화면에는 셀렉트가 없어요', () => {
		expect(findSelect(helpView('music', ctx(), false).toJSON())).toBeUndefined();
	});

	it('카테고리 화면에 제목이 있어요', () => {
		const text = helpView('fun', ctx()).toJSON().components[0] as APITextDisplayComponent;
		expect(text.content).toContain('놀이');
	});
});
