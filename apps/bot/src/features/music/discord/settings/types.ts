import type { container } from '@sapphire/framework';
import type {
	ButtonBuilder,
	ButtonInteraction,
	ChannelSelectMenuBuilder,
	ChannelSelectMenuInteraction,
	RoleSelectMenuBuilder,
	RoleSelectMenuInteraction,
	StringSelectMenuBuilder,
	StringSelectMenuInteraction
} from 'discord.js';
import type { Guild } from '@sirubot/prisma';
import type { settingsId } from '../customIds.ts';

/** `/설정` 패널의 화면(페이지) 목록 — 첫 화면 `main`과 기능별 페이지 */
export const SETTINGS_SCREENS = ['main', 'music', 'sponsorblock', 'dj', 'channel', 'jtc', 'audio', 'ai', 'chatTools'] as const;
export type SettingsScreen = (typeof SETTINGS_SCREENS)[number];

/** 첫 화면의 이동 셀렉트로 갈 수 있는 페이지 */
export const SETTINGS_PAGES = SETTINGS_SCREENS.filter((s): s is Exclude<SettingsScreen, 'main'> => s !== 'main');

/** 첫 화면에서 "음악" 한 항목으로 묶이는 페이지 — 각 페이지 위의 하위 이동 셀렉트로 서로 오가요 */
export const MUSIC_SUBPAGES = ['music', 'audio', 'sponsorblock', 'dj'] as const satisfies readonly SettingsScreen[];
export type MusicSubpage = (typeof MUSIC_SUBPAGES)[number];

export function isMusicSubpage(screen: SettingsScreen): screen is MusicSubpage {
	return (MUSIC_SUBPAGES as readonly string[]).includes(screen);
}

/** 컴포넌트가 아니라 모달·입력칸 ID라서 `SETTINGS_ACTIONS`에 없는 액션 — `settingsModal.ts`가 받아요 */
export const SETTINGS_MODAL_ACTIONS = [
	'jtcTemplateModal',
	'jtcTemplateInput',
	'crossfadeModal',
	'crossfadeInput',
	'automixModal',
	'automixTempoInput',
	'automixConfidenceInput'
] as const;
export type SettingsModalAction = (typeof SETTINGS_MODAL_ACTIONS)[number];

export type SettingsComponentAction = Exclude<NonNullable<ReturnType<typeof settingsId.decode>>['action'], SettingsModalAction>;

export function isSettingsModalAction(action: string): action is SettingsModalAction {
	return (SETTINGS_MODAL_ACTIONS as readonly string[]).includes(action);
}

export type SettingsInteraction =
	| ButtonInteraction<'cached'>
	| StringSelectMenuInteraction<'cached'>
	| RoleSelectMenuInteraction<'cached'>
	| ChannelSelectMenuInteraction<'cached'>;

/** 액션 하나를 처리할 때 필요한 것들 — 서비스는 핸들러의 `this.container`에서 와요. */
export interface SettingsContext {
	interaction: SettingsInteraction;
	guildId: string;
	/** 패널이 놓인 채널 — 채팅 유틸·AI 페이지의 "이 채널" 기준이에요 */
	channelId: string;
	services: typeof container;
}

/** 화면을 그릴 때 필요한, 길드 설정 말고의 정보 */
export interface SettingsViewContext {
	channelId?: string;
}

/** apply가 돌려줄 수 있는 후속 안내 — 화면을 다시 그린 뒤 본인에게만 보여줘요 */
export type SettingsApplyResult = void | { notice: string; warn?: boolean };

export type SettingsControlBuilder = ButtonBuilder | StringSelectMenuBuilder | RoleSelectMenuBuilder | ChannelSelectMenuBuilder;

/**
 * 컨트롤 한 개의 정의 — 뷰가 표를 읽어 화면에 놓아요.
 * customId는 뷰가 표의 액션 이름으로 붙이므로 `build`는 customId를 설정하지 않아요.
 * 같은 `row` 키의 컨트롤은 표에 적힌 순서대로 한 줄에 놓여요 (셀렉트는 줄마다 하나).
 */
export interface SettingsControl {
	screen: SettingsScreen;
	row: string;
	build: (guild: Guild, ctx: SettingsViewContext) => SettingsControlBuilder;
}

export type SettingsEntry = (
	| {
			/** 액션을 처리한 뒤 다시 그릴 화면. 함수면 선택한 값으로 정해요. */
			mode: SettingsScreen | ((ctx: SettingsContext) => SettingsScreen);
			/** 설정을 바꾸는 부수 효과. 컴포넌트 종류가 맞지 않으면 아무것도 하지 않아요. 화면 이동만 하는 액션은 생략해요. */
			apply?: (ctx: SettingsContext) => Promise<SettingsApplyResult>;
	  }
	| {
			/** 응답 자체가 되는 액션(모달)이라 deferUpdate 전에 처리하고 화면을 다시 그리지 않아요. */
			preDefer: (ctx: SettingsContext) => Promise<void>;
	  }
) & {
	/** 화면에 놓이는 컨트롤. 뒤로가기는 뷰가 모든 하위 페이지에 붙이므로 null이에요. */
	control: SettingsControl | null;
};
