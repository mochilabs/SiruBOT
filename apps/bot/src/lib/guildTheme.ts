import { AsyncLocalStorage } from 'node:async_hooks';
import { normalizeThemePreset, type ThemePreset } from '@sirubot/utils/guildSettingsContract';

/**
 * 서버 테마 맥락 — 상호작용·컨트롤러 렌더 한 번 동안 "이 서버의 테마 프리셋"을 들고 있어요.
 * utils의 맥락 훅(`setContextThemeResolver`)이 이 값을 읽어서, 뷰 함수 시그니처를 바꾸지 않고도
 * `createContainer()`(강조선)와 `emoji()`(앱 이모지 세트)가 서버 테마를 따라가요.
 *
 * DB는 맥락을 여는 지점에서 길드당 한 번만(캐시된 `getGuild`) 읽고, 렌더 중에는 메모리 값만 써요.
 */
const store = new AsyncLocalStorage<{ preset: ThemePreset }>();

/** 현재 맥락의 테마 프리셋. 맥락 밖이면 null(=기본). */
export function currentGuildTheme(): ThemePreset | null {
	return store.getStore()?.preset ?? null;
}

/**
 * `guildId` 서버의 테마를 맥락에 싣고 `fn`을 실행해요. 이미 맥락 안이면 새로 조회하지 않고 그대로 재사용해요.
 * 서버 밖(DM)이거나 조회에 실패하면 기본 테마로 진행해요 — 색 때문에 응답이 막히면 안 돼요.
 */
export async function withGuildTheme<T>(
	guildId: string | null | undefined,
	loadTheme: (guildId: string) => Promise<string | null | undefined>,
	fn: () => Promise<T> | T
): Promise<T> {
	if (store.getStore()) return fn();
	let preset: ThemePreset = normalizeThemePreset(null);
	if (guildId) {
		try {
			preset = normalizeThemePreset(await loadTheme(guildId));
		} catch {
			preset = normalizeThemePreset(null);
		}
	}
	return store.run({ preset }, fn);
}
