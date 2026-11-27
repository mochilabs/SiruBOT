import { container } from '@sapphire/framework';
import { DiscordAPIError, type RESTJSONErrorCodes } from 'discord.js';

export async function ignoreDiscord<T>(promise: Promise<T>, codes: readonly RESTJSONErrorCodes[]): Promise<T | null> {
	try {
		return await promise;
	} catch (error) {
		if (error instanceof DiscordAPIError && (codes as readonly (string | number)[]).includes(error.code)) return null;
		container.logger.warn(`[ignoreDiscord] 예상하지 못한 실패를 무시했어요: ${String(error)}`);
		return null;
	}
}
