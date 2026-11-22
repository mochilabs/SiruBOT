import { AsyncLocalStorage } from 'node:async_hooks';
import { normalizeGuildAccentColor } from '@sirubot/utils/guildSettingsContract';

/**
 * 서버 강조색 맥락 — 상호작용·컨트롤러 렌더 한 번 동안 "이 서버의 강조색"을 들고 있어요.
 * `createContainer()`가 utils의 맥락 훅(`setContextAccentResolver`)으로 이 값을 읽어서,
 * 뷰 함수 시그니처를 바꾸지 않고도 메시지 컨테이너 강조선이 서버 색을 따라가요.
 */
const store = new AsyncLocalStorage<{ accentColor: string | null }>();

/** 현재 맥락의 서버 강조색 ('#RRGGBB' 또는 null=기본색). 맥락 밖이면 null. */
export function currentGuildAccent(): string | null {
	return store.getStore()?.accentColor ?? null;
}

/**
 * `guildId` 서버의 강조색을 맥락에 싣고 `fn`을 실행해요.
 * 서버 밖(DM)이거나 조회에 실패하면 기본색으로 진행해요 — 색 때문에 응답이 막히면 안 돼요.
 */
export async function withGuildAccent<T>(
	guildId: string | null | undefined,
	loadAccent: (guildId: string) => Promise<string | null | undefined>,
	fn: () => Promise<T> | T
): Promise<T> {
	let accentColor: string | null = null;
	if (guildId) {
		try {
			accentColor = normalizeGuildAccentColor(await loadAccent(guildId));
		} catch {
			accentColor = null;
		}
	}
	return store.run({ accentColor }, fn);
}
