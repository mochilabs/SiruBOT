// Wire strings must stay byte-identical across rolling deploys.
import { z } from 'zod';

// Disallows ':' and whitespace to prevent Redis key/channel injection.
export const redisIdSchema = z
	.string()
	.trim()
	.min(1)
	.max(32)
	.regex(/^[A-Za-z0-9_-]+$/, 'ID 형식이 올바르지 않아요.');

export const GUILD_SETTINGS_INVALIDATE_CHANNEL = 'sirubot:guild-settings:invalidate';

export const INCIDENT_NOTICE_KEY = 'sirubot:incident-notice';

export const BOT_PROFILE_SET_CHANNEL = 'sirubot:bot-profile:set';

export const BOT_PROFILE_REFRESH_CHANNEL = 'sirubot:bot-profile:refresh';

export const BOT_PROFILE_STATE_CHANNEL_PREFIX = 'sirubot:bot-profile:state:';

export function botProfilePendingKey(guildId: string): string {
	return `sirubot:bot-profile:pending:${guildId}`;
}

export const MEMBER_GREETING_SEND_CHANNEL = 'sirubot:member-greeting:send';

export function memberGreetingPendingKey(guildId: string): string {
	return `sirubot:member-greeting:pending:${guildId}`;
}

export const MEMBER_GREETING_STATE_CHANNEL_PREFIX = 'sirubot:member-greeting:state:';

export function memberGreetingStateChannel(guildId: string): string {
	return `${MEMBER_GREETING_STATE_CHANNEL_PREFIX}${guildId}`;
}

export const PLAYER_STATE_CHANNEL_PREFIX = 'sirubot:player:';

export const PLAYER_STATE_CHANNEL_PATTERN = `${PLAYER_STATE_CHANNEL_PREFIX}*`;

export function playerStateChannel(guildId: string): string {
	return `${PLAYER_STATE_CHANNEL_PREFIX}${guildId}`;
}

export function guildIdFromPlayerStateChannel(channel: string): string | null {
	return channel.startsWith(PLAYER_STATE_CHANNEL_PREFIX) ? channel.slice(PLAYER_STATE_CHANNEL_PREFIX.length) : null;
}

export const GUILD_DATA_REQUEST_CHANNEL = 'sirubot:guild-data:request';
export const GUILD_DATA_RESPONSE_CHANNEL = 'sirubot:guild-data:response';

export const PLAYER_WEB_REQUEST_CHANNEL = 'sirubot:player-web:request';
export const PLAYER_WEB_RESPONSE_CHANNEL = 'sirubot:player-web:response';

export const JTC_SETUP_REQUEST_CHANNEL = 'sirubot:jtc-setup:request';
export const JTC_SETUP_RESPONSE_CHANNEL = 'sirubot:jtc-setup:response';

export const SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL = 'sirubot:social:webhook-create:request';
export const SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL = 'sirubot:social:webhook-create:response';

export const BOT_ADMIN_REQUEST_CHANNEL = 'sirubot:bot-admin:request';
export const BOT_ADMIN_RESPONSE_CHANNEL = 'sirubot:bot-admin:response';

export const PANEL_POST_REQUEST_CHANNEL = 'sirubot:panel-post:request';
export const PANEL_POST_RESPONSE_CHANNEL = 'sirubot:panel-post:response';

export const GIVEAWAY_MANAGE_REQUEST_CHANNEL = 'sirubot:giveaway-manage:request';
export const GIVEAWAY_MANAGE_RESPONSE_CHANNEL = 'sirubot:giveaway-manage:response';

export const ROLE_VALIDATION_REQUEST_CHANNEL = 'sirubot:role-validation:request';
export const ROLE_VALIDATION_RESPONSE_CHANNEL = 'sirubot:role-validation:response';
