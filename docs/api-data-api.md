# data-api HTTP contract

> **As of**: 2026-11-13 · Verified against the route files under `apps/data-api/src/routes/`.

Shared channels and flows are in `./architecture.md` (5.2 Redis pub/sub channel map, 6.2 Redis request/reply, 6.3 External provider caching). This page lists the HTTP routes as they exist in code. Paths in the tables are relative to `apps/data-api/src/`.

## Authentication

- The key is `DATA_API_AUTH_KEY ?? AUTH_KEY`. With neither set, data-api **refuses to start** (fail-closed).
- `GET /api/health` is the only unauthenticated path, matched exactly (`plugins/auth.ts`). `/dashboard` requires the key too.
- Keys are compared as sha256 digests with `timingSafeEqual` (`packages/app-kit/src/auth.ts`).
- Callers send the **raw key** in `Authorization`, with no `Bearer` prefix (`apps/dashboard/src/lib/data-api/client.ts`). The bot, the dashboard and data-api share the key.
- Without the key the dashboard skips every call, so channel, role and player features look like 502s.

## Endpoints

Routes are registered from `routes/index.ts`, one file per domain.

### Service

| Route | Description | Notes | File |
|---|---|---|---|
| GET `/api/health` | Health check | Unauthenticated | `routes/index.ts` |
| GET `/v1/status` | Operational metrics: cache, circuit breakers, hubs | | `routes/index.ts` |
| GET `/dashboard` | Built-in monitoring page | Polls every 5 s | `routes/dashboard.ts` |

### Cached external providers

| Route | Description | Cache TTL | File |
|---|---|---|---|
| GET `/v1/ohaasa` | Daily horoscope, translated | 7 days | `routes/ohaasa.ts` |
| POST `/v1/ohaasa/refresh` | Refresh the horoscope now | | `routes/ohaasa.ts` |
| GET `/v1/lyrics?q=` | Lyrics search (lrclib) | 30 days | `routes/cache-providers.ts` |
| GET `/v1/weather?location=&scope=` | Geocoding, forecast and air quality (Open-Meteo). `scope` is `now`, `today`, `tomorrow` or `week` | 15 minutes | `routes/cache-providers.ts` |
| GET `/v1/delivery/track?carrier=&number=` | Parcel tracking | 5 minutes | `routes/cache-providers.ts` |
| GET `/v1/delivery/carriers?q=` | Carrier list | | `routes/cache-providers.ts` |
| GET `/v1/chapters?videoId=&durationMs=` | YouTube.js chapters | 12 hours; 1 hour when empty | `routes/cache-providers.ts` |
| GET `/v1/youtube/suggestions?q=` | YouTube.js search suggestions | 10 minutes | `routes/cache-providers.ts` |
| GET `/v1/sponsorblock/segments?videoId=` | SponsorBlock skip segments in milliseconds | 24 hours; 1 hour when empty; a positive result is served stale for 7 days on upstream failure | `routes/cache-providers.ts` |
| POST `/v1/embed-fix/metadata` | Embed-repair metadata for X (fxtwitter), Instagram and BOOTH links | Provider cache | `routes/embed-fix.ts` |
| GET `/v1/tts/voices?lang=&q=` | siru_tts voice catalog proxy, first 200 voices. 503 without `SIRU_TTS_URL` | 5 minutes, in memory | `routes/tts.ts` |

### Playback and live player

| Route | Description | Notes | File |
|---|---|---|---|
| GET `/v1/youtube/search?query=` | YouTube search through Lavalink REST | Not cached. 503 when Lavalink REST is not configured | `routes/player.ts` |
| POST `/v1/playback/events` | Playback event ingestion from the bot | | `routes/player.ts` |
| GET `/v1/playback/recent?limit=` | Recent playback events | `limit` 1 to 100, default 20 | `routes/player.ts` |
| GET `/v1/player/:guildId` | Live player state | Unknown guilds return `player: null` plus hub status, not 404 | `routes/player.ts` |
| GET `/v1/player/:guildId/stream` | Live player state as SSE | Keepalive comment every 15 s | `routes/player.ts` |
| GET `/v1/player/:guildId/voice-context?userId=` | The requester's voice and permission state | Request/reply | `routes/player.ts` |
| POST `/v1/internal/player/search` | Web player search | Request/reply | `routes/player.ts` |
| POST `/v1/internal/player/play` | Web player play | Request/reply | `routes/player.ts` |
| POST `/v1/internal/player/control` | Web player control | Request/reply | `routes/player.ts` |

### Image rendering

| Route | Description | Notes | File |
|---|---|---|---|
| POST `/v1/image/profile` | Profile card PNG, preset `dark` or `ticket` | Dedup key `img:card:` | `routes/render.ts` |
| POST `/v1/image/member-card` | Greeting card, kind `welcome` or `goodbye` | Dedup key `img:greeting:`; body limit 4 MB | `routes/render.ts` |
| POST `/v1/image/member-card/background` | Normalize an uploaded background to JPEG (longest side 1600 px, at most 900 KB) | Body limit 8 MB | `routes/render.ts` |
| POST `/v1/image/member-card/layer-image` | Normalize an uploaded sticker layer to PNG | Body limit 8 MB | `routes/render.ts` |
| POST `/v1/image/nowplaying` | Now-playing card | Dedup key `img:nowplaying:`, bucketed by 5 s of position | `routes/render.ts` |
| POST `/v1/image/ohaasa` | Horoscope card for one zodiac sign (rank, lucky item and key, date). The bot shows the description as text below it and falls back to text only when rendering fails | Dedup key `img:ohaasa:` | `routes/render.ts` |
| POST `/v1/image/ohaasa/top` | Horoscope top 3 card (rank and sign only) for the lookup without a sign | Dedup key `img:ohaasa-top:` | `routes/render.ts` |
| POST `/v1/image/weather` | Weather card (now, today, tomorrow, week strip). The bot falls back to a text card when rendering fails | Dedup key `img:weather:` | `routes/render.ts` |

### Guild data and bot-bound work

| Route | Description | Notes | File |
|---|---|---|---|
| GET `/v1/guilds/:guildId/channels` | Channel list from the bot's cache | Request/reply | `routes/guild-data.ts` |
| GET `/v1/guilds/:guildId/roles` | Role list from the bot's cache | Request/reply | `routes/guild-data.ts` |
| GET `/v1/guilds/:guildId/members?userIds=` | Member display info from the bot's cache | Comma-separated ids, at most 10. Members the bot cannot find are omitted | `routes/guild-data.ts` |
| GET `/v1/bot-profile/:guildId` | Read and refresh the bot's per-guild profile | | `routes/guild-data.ts` |
| POST `/v1/internal/bot-profile/set` | Apply a bot profile: body goes to a pending key, then a broadcast triggers the bot | Pending TTL 120 s; body limit 8 MB | `routes/guild-data.ts` |
| POST `/v1/internal/greeting/send` | Send a greeting test message | Pending TTL 120 s | `routes/guild-data.ts` |
| GET `/v1/greeting/state/:guildId` | Poll the greeting test result | | `routes/guild-data.ts` |
| POST `/v1/internal/guild-settings/invalidate` | Broadcast a guild settings cache invalidation | 503 without Redis | `routes/guild-data.ts` |
| POST `/v1/internal/jtc/setup` | Create the join-to-create marker channel | Request/reply | `routes/guild-data.ts` |
| POST `/v1/internal/panel/post` | Ask the bot to post a ticket or role panel. Body: `guildId`, `type` (`ticket` or `rolePanel`), optional `panelId`, `channelId`, `refresh` | Request/reply | `routes/panel.ts` |
| POST `/v1/internal/role-panel/validate-roles` | Check before saving that the bot can grant the roles. Body: `guildId`, `roleIds`; returns `invalidRoleIds` | Request/reply | `routes/panel.ts` |
| POST `/v1/internal/bot-admin` | Operator controls: `nodes-status`, `node-reconnect`, `node-disconnect`, `emojis-list`, `emojis-sync`, `reload-stores` | Request/reply | `routes/bot-admin.ts` |

### AI

| Route | Description | Notes | File |
|---|---|---|---|
| POST `/v1/ai/custom-command-draft` | Draft a custom command spec from natural language | 503 when the provider is not configured, 502 when it fails | `routes/ai.ts` |
| POST `/v1/ai/custom-command-refine` | Revise a spec from the current spec, an instruction and recent turns | 503 when the provider is not configured, 502 when it fails | `routes/ai.ts` |

### Proxies to notifier and storage

| Route | Description | File |
|---|---|---|
| GET, POST `/v1/guilds/:guildId/social/subscriptions` | List and create social alert subscriptions (notifier) | `routes/social.ts` |
| PATCH, DELETE `/v1/guilds/:guildId/social/subscriptions/:id` | Update and delete a subscription (notifier) | `routes/social.ts` |
| POST `/v1/social/youtube/resolve`, POST `/v1/social/twitch/resolve` | Resolve a channel identifier (notifier) | `routes/social.ts` |
| POST `/v1/social/chzzk/profile`, GET `/v1/social/chzzk/search` | Chzzk profile lookup and search (notifier) | `routes/social.ts` |
| PUT, GET `/v1/storage/transcripts/*` | Upload and download ticket transcripts in the private bucket. The key must match `{guildId}/{ticketId}.json.gz`; upload limit 16 MB | `routes/storage.ts` |

## Error mapping

Every relay to the bot uses the same mapping (`routes/common.ts`):

| Reason | HTTP | `error` code |
|---|---|---|
| `redis_unavailable` | 503 | `redis_unavailable` |
| `timeout` (the bot did not answer, or no bot owns the guild) | 502 | `bot_timeout` |
| `bot_error` (the bot rejected the request) | 400 | The bot's rejection code, passed through |

The guild data routes (channels, roles, members) never produce `bot_error`, so they only return 503 or 502 (`routes/guild-data.ts`).

## Schedulers

- **Horoscope**: daily at 06:50 KST (`OHAASA_REFRESH_AT`, default in `config/env.ts`; scheduler in `services/ohaasaScheduler.ts`). When the upstream is down, `GET /v1/ohaasa` serves the last good result (`routes/ohaasa.ts`).
- **Memory tidy**: runs only with `DATABASE_URL`, a configured translation provider and `MEMORY_TIDY_ENABLED` (default true). Defaults are daily at 00:00 in the server's local time (`MEMORY_TIDY_AT`) with a batch of 40 (`MEMORY_TIDY_BATCH_SIZE`) (`services/memoryTidy.ts`, `config/env.ts`).
