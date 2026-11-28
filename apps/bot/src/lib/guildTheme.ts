import { AsyncLocalStorage } from 'node:async_hooks';
import { normalizeThemePreset, type ThemePreset } from '@sirubot/utils/guildSettingsContract';

const store = new AsyncLocalStorage<{ preset: ThemePreset }>();

export function currentGuildTheme(): ThemePreset | null {
	return store.getStore()?.preset ?? null;
}

// fresh: 타이머·컬렉터 등 오래 사는 콜백이 옛 테마를 물려받지 않게 새로 읽어요
export async function withGuildTheme<T>(
	guildId: string | null | undefined,
	loadTheme: (guildId: string) => Promise<string | null | undefined>,
	fn: () => Promise<T> | T,
	options?: { fresh?: boolean }
): Promise<T> {
	if (!options?.fresh && store.getStore()) return fn();
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
