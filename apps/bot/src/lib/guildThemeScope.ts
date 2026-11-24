import { container } from '@sapphire/framework';
import { withGuildTheme } from './guildTheme.ts';

/**
 * 상호작용 밖(리스너·스케줄러·대시보드 요청·플레이어 알림)에서 서버 테마가 필요한 곳이 쓰는 진입점이에요.
 * 서버 테마는 길드 설정 캐시(`getGuild`, 60초)에서 한 번만 읽고, 이미 테마 맥락 안이면 다시 읽지 않아요.
 *
 * 메시지가 오갈 때마다 도는 리스너는 "실제로 테마가 필요한 응답을 보낼 때만" 이걸 호출해야 해요
 * (모든 메시지에서 열면 쓰지 않는 길드 설정 조회가 늘어요).
 */
export function inGuildTheme<T>(guildId: string | null | undefined, fn: () => Promise<T> | T): Promise<T> {
	return withGuildTheme(guildId, async (id) => (await container.guildService.getGuild(id)).themePreset, fn);
}

/**
 * `inGuildTheme`과 같지만 이미 열린 테마 맥락을 재사용하지 않고 서버 설정 캐시에서 다시 읽어요.
 * 타이머(진행 막대·실시간 가사)와 컴포넌트 컬렉터 콜백처럼 오래 살면서 다시 그리는 곳에 써요.
 */
export function inFreshGuildTheme<T>(guildId: string | null | undefined, fn: () => Promise<T> | T): Promise<T> {
	return withGuildTheme(guildId, async (id) => (await container.guildService.getGuild(id)).themePreset, fn, { fresh: true });
}
