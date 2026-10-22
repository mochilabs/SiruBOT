import { emoji } from '@sirubot/utils';
import { DiscordAPIError } from 'discord.js';

/** Discord API 오류 코드 — 채널 미확인 / 접근 권한 부재 */
const DISCORD_UNKNOWN_CHANNEL = 10003;
const DISCORD_MISSING_ACCESS = 50001;
const DISCORD_MISSING_PERMISSIONS = 50013;

/**
 * "디스코드에 요청하는 처리" 흐름이 공유하는 실패 안내 — 채널 미확인과 권한 부재는
 * 모든 응답자(JTC 마커 채널·소셜 웹훅 등)가 같은 문구로 답한다.
 * feature별 권한·폴백 문구는 호출자가 넘기고, 해당 없는 오류는 fallback으로 끝낸다.
 */
export function discordApiErrorText(error: unknown, options: { permission: string; fallback: string }): string {
	if (error instanceof DiscordAPIError) {
		if (error.code === DISCORD_UNKNOWN_CHANNEL) return `${emoji('error')} 채널을 찾을 수 없어요.`;
		if (error.code === DISCORD_MISSING_ACCESS || error.code === DISCORD_MISSING_PERMISSIONS) {
			return `${emoji('error')} ${options.permission}`;
		}
	}
	return options.fallback;
}
