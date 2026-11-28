import { emoji } from '@sirubot/utils';
import { DiscordAPIError } from 'discord.js';

const DISCORD_UNKNOWN_CHANNEL = 10003;
const DISCORD_MISSING_ACCESS = 50001;
const DISCORD_MISSING_PERMISSIONS = 50013;

export function discordApiErrorText(error: unknown, options: { permission: string; fallback: string }): string {
	if (error instanceof DiscordAPIError) {
		if (error.code === DISCORD_UNKNOWN_CHANNEL) return `${emoji('error')} 채널을 찾을 수 없어요.`;
		if (error.code === DISCORD_MISSING_ACCESS || error.code === DISCORD_MISSING_PERMISSIONS) {
			return `${emoji('error')} ${options.permission}`;
		}
	}
	return options.fallback;
}
