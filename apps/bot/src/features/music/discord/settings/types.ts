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

export const SETTINGS_SCREENS = ['main', 'music', 'sponsorblock', 'dj', 'channel', 'jtc', 'audio', 'ai', 'chatTools'] as const;
export type SettingsScreen = (typeof SETTINGS_SCREENS)[number];

export const SETTINGS_PAGES = SETTINGS_SCREENS.filter((s): s is Exclude<SettingsScreen, 'main'> => s !== 'main');

export const MUSIC_SUBPAGES = ['music', 'audio', 'sponsorblock', 'dj'] as const satisfies readonly SettingsScreen[];
export type MusicSubpage = (typeof MUSIC_SUBPAGES)[number];

export function isMusicSubpage(screen: SettingsScreen): screen is MusicSubpage {
	return (MUSIC_SUBPAGES as readonly string[]).includes(screen);
}

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

export interface SettingsContext {
	interaction: SettingsInteraction;
	guildId: string;
	channelId: string;
	services: typeof container;
}

export interface SettingsViewContext {
	channelId?: string;
}

export type SettingsApplyResult = void | { notice: string; warn?: boolean };

export type SettingsControlBuilder = ButtonBuilder | StringSelectMenuBuilder | RoleSelectMenuBuilder | ChannelSelectMenuBuilder;

export interface SettingsControl {
	screen: SettingsScreen;
	row: string;
	build: (guild: Guild, ctx: SettingsViewContext) => SettingsControlBuilder;
}

export type SettingsEntry = (
	| {
			mode: SettingsScreen | ((ctx: SettingsContext) => SettingsScreen);
			apply?: (ctx: SettingsContext) => Promise<SettingsApplyResult>;
	  }
	| {
			preDefer: (ctx: SettingsContext) => Promise<void>;
	  }
) & {
	control: SettingsControl | null;
};
