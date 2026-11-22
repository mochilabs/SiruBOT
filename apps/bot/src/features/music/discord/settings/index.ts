import { aiActions } from './ai.ts';
import { audioActions } from './audio.ts';
import { chatToolsActions } from './chatTools.ts';
import { coreActions } from './core.ts';
import type { SettingsComponentAction, SettingsEntry } from './types.ts';

/**
 * 설정 액션 표 — 화면에 놓이는 컨트롤(`control`)과 누른 뒤의 처리(`mode`·`apply`)를 한 항목에 적어요.
 * 뷰(`views/settings.ts`)가 이 표에서 컨트롤을 만들고 핸들러(`interaction-handlers/settings.ts`)가 같은 표로 처리해요.
 * 새 `settingsId` 액션은 여기에 항목 하나를 더하면 돼요 (없으면 타입 검사가 실패해요).
 * 한 줄에 놓이는 순서는 표의 순서와 같아요.
 */
export const SETTINGS_ACTIONS = {
	...coreActions,
	...audioActions,
	...aiActions,
	...chatToolsActions
} satisfies Record<SettingsComponentAction, SettingsEntry>;

export type { SettingsContext, SettingsEntry, SettingsScreen, SettingsViewContext } from './types.ts';
export { SETTINGS_SCREENS, isSettingsModalAction } from './types.ts';
