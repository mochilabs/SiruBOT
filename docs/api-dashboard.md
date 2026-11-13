# Dashboard API route contract

> **As of**: 2026-11-13 · Verified against `apps/dashboard/src/app/api/**/route.ts` (65 route files).

Higher-level flows are in `./architecture.md` (4.3 apps/dashboard, 6.2 Redis request/reply). Paths below are relative to `apps/dashboard/src/` unless they start with `apps/` or `packages/`.

## Layers

Browser → **API route** (session, role, rate limit, zod) → **database, data-api, shardmanager or storage**.

Service keys are server-only and must never reach the client bundle (`lib/data-api/client.ts`). The dashboard never talks to the bot: bot-bound work goes through data-api.

Sign-in is next-auth with Discord OAuth (`lib/auth.ts`): scope `identify guilds`, JWT sessions lasting 24 hours, issuer pinned to `https://discord.com`.

## Roles

Routes are built with `createGuildApiHandler` (`lib/api-handler.ts`), which runs the role check, the rate limit and the zod schema before the handler. The checks themselves live in `lib/api-guards.ts`.

| Role | Requirement | Failure |
|---|---|---|
| `manage` | Signed in and can manage the guild in the path | 401, 403, or 502 when Discord cannot be reached |
| `member` | Signed in and a member of the guild in the path | 401, 403, or 502 |
| `user` | Signed in | 401 |
| `admin` | Signed in and listed in `DASHBOARD_ADMIN_IDS`. Unset blocks everyone (fail-closed, `lib/admin-ids.ts`) | 401 or 403 |
| public | No session needed. Four routes call `publicReadLimit` directly instead of using the handler | |

A Discord outage (429, 5xx, network) is reported as `unavailable` and answered with 502, so it is never mistaken for "no permission".

## Route groups

All paths are under `/api`. `[id]` is the guild id.

| Group | Routes | Role | Backend |
|---|---|---|---|
| Auth (1) | `auth/[...nextauth]` | | next-auth handler |
| Servers (1) | `servers` | user | The caller's guilds from the Discord API, matched against guilds where the bot is installed |
| Favorites (1) | `favorites` | user | Database |
| Playlists (5) | `playlists`, `playlists/search`, `playlists/[id]`, `playlists/[id]/tracks`, `playlists/[id]/reorder` | user | Database |
| Profile (3) | `profile/birthday`, `profile/tts`, `profile/tts-voices` | user | Database; `tts-voices` reads the voice catalog through data-api |
| Guild settings (5) | `servers/[id]/settings`, `channels`, `roles`, `stats`, `bot-profile` | manage | Database; `channels` and `roles` come from the bot's cache through data-api |
| AI (2) | `servers/[id]/ai`, `ai/history` | manage | Database |
| Custom commands (4) | `servers/[id]/custom-commands`, `custom-commands/draft`, `custom-commands/refine`, `custom-commands/[cmdId]` | manage | Database; `draft` and `refine` call the data-api LLM routes. A command's execution method cannot change after creation |
| Greeting (6) | `servers/[id]/greeting`, `greeting/background`, `greeting/layer-image`, `greeting/preview`, `greeting/status`, `greeting/test` | manage | Images and the test send go through data-api |
| Join-to-create (1) | `servers/[id]/jtc/setup` | manage | data-api → bot (creating the marker channel needs the bot token) |
| Live state (2) | `servers/[id]/live`, `live/stream` | manage | data-api; `live/stream` relays SSE |
| Player (5) | `servers/[id]/player`, `player/command`, `player/play`, `player/search`, `player/voice-context` | member | data-api request/reply |
| TTS (1) | `servers/[id]/tts` | member | Database: the caller's own voice for that guild |
| Assets (2) | `servers/[id]/assets`, `assets/[assetId]` | manage | The dashboard uploads to and deletes from the storage public bucket directly |
| Social alerts (6) | `servers/[id]/social/subscriptions`, `subscriptions/[subId]`, `social/youtube/resolve`, `social/twitch/resolve`, `social/chzzk/profile`, `social/chzzk/search` | manage | data-api, which proxies to notifier |
| Tickets (4) | `servers/[id]/ticket`, `ticket/post`, `ticket/tickets`, `ticket/[ticketId]/transcript` | manage | Settings in the database; posting goes data-api → bot; transcripts through the data-api storage proxy |
| Role panels (3) | `servers/[id]/role-panels`, `role-panels/[panelId]`, `role-panels/[panelId]/post` | manage | Database for list, create, update and delete (create and update ask the bot to validate the roles; update refreshes the posted message); posting goes data-api → bot. Every read, write and post checks that the panel belongs to guild `[id]` |
| Operator (9) | `admin/overview`, `admin/guilds`, `admin/guilds/[id]`, `admin/users`, `admin/users/[id]`, `admin/social`, `admin/social/[subId]`, `admin/bot-control`, `data-api` | admin | `bot-control` delegates to data-api `bot-admin`; `data-api` proxies data-api status |
| Public (4) | `shards`, `tracks`, `voice-servers`, `voice-servers/history` | public | Shard status from shardmanager, the track chart from the database, Lavalink stream counts |

## Rate limits

Rules are defined in `lib/rate-limit.ts`. All windows are one minute.

| Rule | Limit | Used for |
|---|---|---|
| `READ_RATE` | 30 | Most reads |
| `WRITE_RATE` | 12 | Most writes |
| `HEAVY_WRITE_RATE` | 5 | Channel creation (`jtc/setup`), LLM calls (`custom-commands/draft`, `refine`), greeting image uploads |
| `RENDER_RATE` | 60 | Image render preview (`greeting/preview`) |
| `UPLOAD_RATE` | 10 | Asset uploads |
| `PUBLIC_RATE` | 120 | Anonymous requests to public routes, in one shared bucket. Signed-in callers get `READ_RATE` per user |

- The limiter is a Redis sliding window. Server time is read inside the Lua script with `TIME`, which removes clock skew between instances.
- If the Redis script fails, the limiter fails open and logs a warning.
- Public routes never use request headers as the rate-limit subject, because a client can forge them.
- `live/stream` has no rate limit on purpose: it is one long-lived connection.

## Validation

- Schemas are in `lib/schemas.ts`. Snowflakes match `^\d{17,20}$`.
- Guild settings enums, numeric ranges and defaults come from `packages/utils/src/guildSettingsContract.ts` (subpath `@sirubot/utils/guildSettingsContract`), the same contract the bot uses. The volume ceiling follows `@sirubot/utils/playerLimits` (`lib/player-constants.ts`).
- `canPlay` in the `player/voice-context` response is required. The bot always sends it; a response from an older bot without it is rejected by data-api's schema validation, which is accepted during a rolling deploy.

## SSE proxy

`live/stream` authorizes the caller and then relays data-api's SSE stream unchanged (`app/api/servers/[id]/live/stream/route.ts`). Both "not configured" and "upstream failed" return 502, so the client falls back to polling. The data-api client sets no `AbortSignal.timeout` on the stream, because a timeout would cut the whole connection (`lib/data-api/client.ts`).

## `SHARD_MANAGER_AUTH_KEY`

There is no fallback. When it is unset the client throws and `fetchShards()` returns null (`lib/shard-api.ts`). Do not confuse this with the data-api key, which falls back to `AUTH_KEY`.
