import { container } from '@sapphire/framework';
import { DiscordAPIError, type RESTJSONErrorCodes } from 'discord.js';

/**
 * `.catch(() => null)` 대용이에요. 목록에 있는 Discord API 에러 코드는 조용히 무시하고,
 * 그 외 실패는 경고 로그를 남긴 뒤 똑같이 null로 해소해요.
 */
export async function ignoreDiscord<T>(promise: Promise<T>, codes: readonly RESTJSONErrorCodes[]): Promise<T | null> {
	try {
		return await promise;
	} catch (error) {
		if (error instanceof DiscordAPIError && (codes as readonly (string | number)[]).includes(error.code)) return null;
		container.logger.warn(`[ignoreDiscord] 예상하지 못한 실패를 무시했어요: ${String(error)}`);
		return null;
	}
}
