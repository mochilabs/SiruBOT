import { aiActions } from './ai.ts';
import { audioActions } from './audio.ts';
import { chatToolsActions } from './chatTools.ts';
import { coreActions } from './core.ts';
import type { SettingsComponentAction, SettingsEntry } from './types.ts';

export const SETTINGS_ACTIONS = {
	...coreActions,
	...audioActions,
	...aiActions,
	...chatToolsActions
} satisfies Record<SettingsComponentAction, SettingsEntry>;

export type { SettingsContext, SettingsEntry, SettingsScreen, SettingsViewContext } from './types.ts';
export { SETTINGS_SCREENS, isSettingsModalAction } from './types.ts';
