import { THEME_PRESET_DEFAULT, normalizeThemePreset, type ThemePreset } from './guildSettingsContract.js';

/**
 * 현재 실행 맥락(서버)의 테마 프리셋을 돌려주는 훅. 봇이 시작할 때 한 번 등록해요.
 * utils는 node 전용 API(AsyncLocalStorage)를 쓰지 않아서 맥락 저장은 봇이 맡고, 여기서는 읽기만 해요.
 * 맥락이 없는 곳(대시보드, 서비스 단독 호출)은 기본(분홍)이에요.
 */
let resolver: (() => string | null | undefined) | null = null;

export function setContextThemeResolver(next: (() => string | null | undefined) | null): void {
	resolver = next;
}

export function currentThemePreset(): ThemePreset {
	return resolver ? normalizeThemePreset(resolver()) : THEME_PRESET_DEFAULT;
}
