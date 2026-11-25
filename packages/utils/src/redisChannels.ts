// Channel names change across services at once, so they live only here.
import { z } from 'zod';

/** Allowlist for IDs embedded in Redis keys and channels: blocks `:` and whitespace from tangling keys or injecting into another namespace. */
export const redisIdSchema = z
	.string()
	.trim()
	.min(1)
	.max(32)
	.regex(/^[A-Za-z0-9_-]+$/, 'ID 형식이 올바르지 않아요.');

/** Payload `{"guildId"}` only: bots drop the guild from their caches and re-read the DB. */
export const GUILD_SETTINGS_INVALIDATE_CHANNEL = 'sirubot:guild-settings:invalidate';

/** Global key. data-api writes a signed envelope (`IncidentNotice`) with a TTL up to expiry; the bot only reads it (30s cache). */
export const INCIDENT_NOTICE_KEY = 'sirubot:incident-notice';

/** Payload `{"guildId"}`; the body is in `botProfilePendingKey` because an avatar data URI can be large and broadcasts reach every replica. */
export const BOT_PROFILE_SET_CHANNEL = 'sirubot:bot-profile:set';

export const BOT_PROFILE_REFRESH_CHANNEL = 'sirubot:bot-profile:refresh';

export const BOT_PROFILE_STATE_CHANNEL_PREFIX = 'sirubot:bot-profile:state:';

/** Body `{nickname?, avatar?}`. The owning bot reads it and deletes it immediately. */
export function botProfilePendingKey(guildId: string): string {
	return `sirubot:bot-profile:pending:${guildId}`;
}

/** Payload `{"guildId","requestId"}`; the body is in `memberGreetingPendingKey`. */
export const MEMBER_GREETING_SEND_CHANNEL = 'sirubot:member-greeting:send';

/** Body `{kind, userId, requestId}`. The owning bot reads it and deletes it immediately. */
export function memberGreetingPendingKey(guildId: string): string {
	return `sirubot:member-greeting:pending:${guildId}`;
}

export const MEMBER_GREETING_STATE_CHANNEL_PREFIX = 'sirubot:member-greeting:state:';

export function memberGreetingStateChannel(guildId: string): string {
	return `${MEMBER_GREETING_STATE_CHANNEL_PREFIX}${guildId}`;
}

/** The only subscriber is data-api `playerHub` (schema: `playerState.ts`). */
export const PLAYER_STATE_CHANNEL_PREFIX = 'sirubot:player:';

export const PLAYER_STATE_CHANNEL_PATTERN = `${PLAYER_STATE_CHANNEL_PREFIX}*`;

export function playerStateChannel(guildId: string): string {
	return `${PLAYER_STATE_CHANNEL_PREFIX}${guildId}`;
}

export function guildIdFromPlayerStateChannel(channel: string): string | null {
	return channel.startsWith(PLAYER_STATE_CHANNEL_PREFIX) ? channel.slice(PLAYER_STATE_CHANNEL_PREFIX.length) : null;
}

// Request/reply pairs. The dashboard's user token can't call these Discord APIs, and voice state and
// permissions exist only in the bot cache, so data-api publishes REQUEST and only the bot owning the guild
// answers on RESPONSE. Hubs correlate by `requestId`.

/** Schemas: `guildData.ts` */
export const GUILD_DATA_REQUEST_CHANNEL = 'sirubot:guild-data:request';
export const GUILD_DATA_RESPONSE_CHANNEL = 'sirubot:guild-data:response';

/** Schemas: `playerWeb.ts` */
export const PLAYER_WEB_REQUEST_CHANNEL = 'sirubot:player-web:request';
export const PLAYER_WEB_RESPONSE_CHANNEL = 'sirubot:player-web:response';

/** Schemas: `jtcSetup.ts`. Creating or moving the marker channel needs the bot token. */
export const JTC_SETUP_REQUEST_CHANNEL = 'sirubot:jtc-setup:request';
export const JTC_SETUP_RESPONSE_CHANNEL = 'sirubot:jtc-setup:response';

/** Schemas: `social.ts`. Published by notifier; creating a webhook needs Manage Webhooks, which only the bot has. */
export const SOCIAL_WEBHOOK_CREATE_REQUEST_CHANNEL = 'sirubot:social:webhook-create:request';
export const SOCIAL_WEBHOOK_CREATE_RESPONSE_CHANNEL = 'sirubot:social:webhook-create:response';

/** Schemas: `botAdmin.ts` */
export const BOT_ADMIN_REQUEST_CHANNEL = 'sirubot:bot-admin:request';
export const BOT_ADMIN_RESPONSE_CHANNEL = 'sirubot:bot-admin:response';

/** Schemas: `panelPost.ts`. Panel messages with custom-ID buttons can only be sent with the bot token. */
export const PANEL_POST_REQUEST_CHANNEL = 'sirubot:panel-post:request';
export const PANEL_POST_RESPONSE_CHANNEL = 'sirubot:panel-post:response';

/** Schemas: `giveawayManage.ts` */
export const GIVEAWAY_MANAGE_REQUEST_CHANNEL = 'sirubot:giveaway-manage:request';
export const GIVEAWAY_MANAGE_RESPONSE_CHANNEL = 'sirubot:giveaway-manage:response';

/** Schemas: `rolePanel.ts`. Replies with `invalidRoleIds` (managed, above the bot's hierarchy, @everyone). */
export const ROLE_VALIDATION_REQUEST_CHANNEL = 'sirubot:role-validation:request';
export const ROLE_VALIDATION_RESPONSE_CHANNEL = 'sirubot:role-validation:response';
