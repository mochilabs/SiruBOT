# SiruBOT Agent Instructions

Discord music bot platform monorepo (Turborepo + Yarn 4 workspaces, Node 22+, ESM).

| Workspace | Role | Port |
|---|---|---|
| `apps/bot` | Music bot: Sapphire (discord.js) + lavalink-client | — |
| `apps/dashboard` | Web dashboard, Next.js 16 App Router | 3000 |
| `apps/shardmanager` | Shard assignment WS server for bot processes (Fastify) | 3001 |
| `apps/data-api` | Gateway: external API cache, Redis hub, canvas rendering, LLM batch jobs (Fastify) | 3002 |
| `apps/storage` | Object storage with public URLs for Discord embeds (Fastify, no DB) | 3003 |
| `apps/notifier` | Polls YouTube/Twitch/Chzzk and posts Discord webhooks (Fastify) | 3004 |
| `packages/prisma` | PostgreSQL schema + client (`src/schema.prisma`) | |
| `packages/utils` | Redis channels, zod contracts, shared utilities | |
| `packages/app-kit` | Shared Fastify auth, env validation, logger | |
| `packages/shardclient` | shardmanager WS client | |

Write everything under `docs/` in English. In docs, cite file paths only, never line numbers.

Deeper references: architecture `docs/architecture.md`, API contracts `docs/api-{dashboard,data-api}.md`, local setup `docs/setup-dev.md`, operations `docs/runbook-production.md`.

## Branches and PRs

- Work on a feature/fix/refactor branch cut from `beta`. Never commit directly to `beta` or `main`.
- PR base is **always `beta`** (`main` is the deploy snapshot). Fix a wrong base with `gh pr edit <N> --base beta`.
- Titles and bodies follow `docs/pr-message-rule.md`. The body lists verification run and anything left unverified; UI changes include screenshots.

## Skills

Read `.pi/skills/<id>/SKILL.md` before working in its area. Don't recreate a skill's templates or rules here or in code.

- Bot: `sapphire-command` (slash commands, preconditions), `component-view` (Components V2 view files), `discord-components-v2` (V2 component API), `bot-features` (AI chat, TTS, mixer, lyrics, temp voice channels, games), `bot-ops` (playback, Lavalink, sessions, shards, shutdown order)
- Dashboard: `dashboard-conventions` (SWR, zustand, API routes + zod, next-auth), `dashboard-ui` (visual work; load `antislop-ui` first)
- General: `repo-infra` (prisma, utils subpaths, yarn/turbo, CI, Sentry), `security-audit`, `ai-slop-cleaner`

## Commands

```bash
yarn install        # Corepack Yarn 4, node-modules linker
yarn generate       # Prisma client; required before typecheck/build
yarn workspace @sirubot/prisma migrate:dev
yarn dev            # dashboard dev server only (the repo's only dev script)
yarn watch          # watch-build every app/package except the dashboard
yarn lint / yarn lint:fix / yarn typecheck / yarn test
```

- Single test: `yarn workspace @sirubot/bot test src/path/file.test.ts`, or `-t "name"`. If that prints `command not found: vitest` (seen in fresh worktrees), use `yarn turbo test --filter=@sirubot/bot -- src/path/file.test.ts`.
- Tests share the root `vitest.config.ts` (`--config ../../vitest.config.ts`), which aliases `@sirubot/utils`, its subpaths, and `@sirubot/app-kit` to **source**. No package dist build is needed and stale dist can't leak in. Exception: the dashboard has its own `apps/dashboard/vitest.config.ts` (includes `*.test.tsx`).
- `typecheck` runs `^build ^generate` first via turbo. Don't run bare `tsc`.
- Lint: dashboard only uses `eslint . --max-warnings=0`; everything else is prettier `--check` (tabs, single quotes, `printWidth: 150`, `trailingComma: none`).
- Dashboard `dev` uses `--webpack`, `build` uses `--turbopack`.
- CI (`lint.yml`): `yarn install --immutable` → lint → typecheck → build → test. The pre-push hook runs `lint:fix` + typecheck.

## Cross-app communication

Apps never import each other. The only contact points are Redis pub/sub, HTTP with a shared key, and the shardmanager WS protocol.

- **Redis channel names and payload schemas live only in `packages/utils/src/redisChannels.ts`** (plus zod schemas), bundled into contracts in `packages/utils/src/redisContract.ts` (`defineRedisRpc` for request/reply pairs, `defineRedisEvent` / `defineRedisGuildEvent` for one-way channels). Never hardcode channel strings in an app; wire strings must stay byte-identical across a rolling deploy (`redisContract.test.ts` pins them).
- **The dashboard never talks to the bot directly.** It reads/writes the DB via Prisma and uses Redis only for its own needs (rate limits, token store). Anything bound for the bot goes dashboard API route → data-api (HTTP) → Redis → bot.
- Work that needs the bot token or gateway cache (channel/role lists, voice context and DJ permissions, JTC channel setup, bot admin) uses **request/reply**: the publisher sends `*:request` with a `requestId`, only the bot process owning that guild replies on `*:response`, and the publisher's `*Hub` handles correlation and timeouts. Copy an existing pair: data-api `playerWebHub`/`guildDataHub`/`jtcSetupHub`/`botAdminHub`/`panelHub` (built with `createRequestReplyHub` in `utils/requestReplyHub.ts`), notifier `webhookHub` ↔ bot responders. On the bot side a responder is a handler passed to `createRedisResponder(contract, handler)` (`lib/redisResponder.ts`), which owns signature check, JSON/schema validation, guild ownership, error mapping and the signed reply; handlers live in `features/*/inbound/` and are collected in `BotApplication.setupServices`. Handlers return the success payload or throw (`AppError` → plain user message, anything else → logged and a generic message). One-way events use `createRedisEventListener`. Replies and state publishes go through `RedisPublisher` (`lib/redisPublisher.ts`), not per-channel store methods.
- Live player: bot publishes snapshots on `sirubot:player:{guildId}` → data-api `playerHub` (sole subscriber) → SSE → dashboard.
- After a settings save, data-api broadcasts `sirubot:guild-settings:invalidate` and every bot process drops that guild's cache (settings and custom commands).
- Large bodies (e.g. avatar data URIs) go in a pending key, not the pub/sub message; the channel message is only a trigger.

## Auth and env gotchas

- Each app has its own `.env` (`apps/bot/.env`, `apps/dashboard/.env`, …). The bot loads it from CWD. Never print or commit secrets.
- **data-api**: refuses to start without `DATA_API_AUTH_KEY ?? AUTH_KEY` (fail-closed). Only exactly `/api/health` is exempt. bot, dashboard, and data-api share the same key. Without a key the dashboard skips every call, so channel/role/player features all look like 502s.
- `Authorization` carries the **raw key, no `Bearer`**.
- **notifier**: refuses to start without `NOTIFIER_AUTH_KEY ?? AUTH_KEY`. The webhook-token encryption key is derived from `AUTH_KEY` when unset, so when rotating `AUTH_KEY` keep the old value separately or existing rows can't be decrypted (`apps/notifier/src/config/env.ts`).
- **storage**: refuses to start without `STORAGE_AUTH_KEY ?? AUTH_KEY`. Exempt: `/health` and public GETs. `STORAGE_PUBLIC_URL` (required; must be a public https domain, but the schema only checks it's a URL) is baked into issued URLs, so changing the domain means bulk-rewriting existing asset URLs. Persist the `STORAGE_DATA_DIR` volume.
- **shardmanager**: the dashboard uses `SHARD_MANAGER_AUTH_KEY` with no fallback. Production bots retry `ShardClient.identify()` against `SHARD_MANAGER_URL` + `AUTH_KEY`. An empty assignment (`NoShardsAvailableError`) is normal during rolling updates. Dev runs standalone (`shards: [0]`).
- **LLM**: data-api's `OPENAI_COMPATIBLE_API_URL` + `OPENAI_API_KEY` serve both translation (`TRANSLATION_MODEL`) and custom-command drafts (`CUSTOM_COMMAND_DRAFT_MODEL`, falls back to the translation model). Without a key, translation serves the original text and the draft API returns 503.
- `LAVALINK_HOSTS`: comma-separated `id_host_port[_password]` (e.g. `main_localhost_2333_youshallnotpass`). Parsed with zod by `packages/utils/src/lavalinkHosts.ts`, which throws before connecting on malformed entries.
- Shared Fastify auth/env/logger lives in `packages/app-kit`. Its logger config hand-mirrors utils `createLogger`; change both together.

## `@sirubot/utils`

- The root barrel mixes in node-only modules, so it's **server apps only**. The dashboard imports subpaths only (eslint `no-restricted-imports` enforces this).
- Pure contracts (zod, types, constants, error classes) are exposed as subpaths. Adding or removing one means editing both `package.json` `exports` and `tsup.config.ts` `entry`.
- Each domain contract is defined in one place (e.g. weather and delivery in `packages/utils/src/{weather,delivery}.ts`). bot and data-api only import them.

## Bot rules

- Relative imports **always include the `.ts` extension** (`allowImportingTsExtensions`). strict + decorators.
- Code lives in `modules/{audio,general}` (Sapphire pieces: `commands,subcommands,preconditions,listeners,interaction-handlers,view`) and `features/<name>/` (`music` application layer plus the web player responder, `tickets`, `role-panels`, `temp-voice`, `games`, `custom-commands`, `greeting`, `dashboard-bridge`). Every store root is listed once in `PIECE_ROOTS` in `core/pieceRoots.ts` (read by `core/bootstrap.ts` and the piece inventory test); a new root goes there.
- Entry chain: `index.ts → core/setup.ts → core/bootstrap.ts` (a short step list over `core/{shardIdentity,botClient,healthServer,lavalinkSetup,shutdown,redisSubscribers}.ts`) `→ core/botApplication.ts`. Container services are assigned in `BotApplication.setupServices`, which also builds the single shared Redis subscription (`createSharedRedisSubscriber` in `core/redisSubscribers.ts`) carrying every responder and event listener, registered in `container.redisSubscribers` (bootstrap starts it, shutdown stops it before `redisStore.disconnect()`).
- All user-facing strings are Korean. Slash-command details follow `sapphire-command`; UI follows `component-view`.
- Command registration: `REGISTER_COMMANDS=true` overwrites, otherwise it only logs to console. Manual sync: `yarn dlx tsx scripts/register-commands.ts [--dry-run] [--global|--guild <id>]`.
- Custom commands:
  - Two kinds: prefix messages (listener `features/custom-commands/discord/listeners/customCommandPrefix.ts`; `!도움말` is reserved) and slash (`slashRegistry.ts`, incrementally synced as guild commands).
  - The spec/name/prefix contract lives only in `packages/utils/src/customCommand.ts`.
  - Engine and cache: `apps/bot/src/features/custom-commands/application/`. Re-validate the spec with zod before running it (`interpreter.ts`).
  - Create/edit/delete only from the dashboard with guild manage permission (`role: "manage"`). Saving triggers the invalidate broadcast, which clears the cache and re-syncs slash commands.
- Shutdown order directly affects session loss. Read `bot-ops` before touching it.

### Where new code goes

- New feature code goes in `features/<name>/`: `index.ts` (public surface), `application/` (use cases), `discord/{commands,listeners,interaction-handlers,views}`, `inbound/` (Redis responders and event listeners). Dashboard-facing responders that belong to no single feature live in `features/dashboard-bridge/`. Entry points (slash, buttons, listeners, dashboard responders, AI tools) are thin adapters over the use cases.
- `application/` must not import Sapphire, views, pieces or config (`APPLICATION_LAYER_DEBT` in `architecture.test.ts` is empty and stays empty). Services are built once in `BotApplication.setupServices` through each feature's factory (`createTicketService(deps)`, `createRolePanelService`, `createTempVoiceService`, `createGameRecords`, `createCustomCommandStore`, `createSlashRegistry`, `createMemberGreetingService`) and reached through `container.<service>`. Deps carry db/logger, narrow ports, config values and, for messages a service posts on its own, a render port implemented in the feature's `discord/` folder (for example `features/tickets/discord/ticketMessages.ts`). Music controls (`container.music`) are the reference.
- Every service under `services/` follows the same rule, audio playback services included: each takes a `deps` object (db, `AppLogger`, other services, config values, lazy getters for things created later in boot or referenced circularly, such as `container.redisStore`, `container.client`, `container.audio`, `container.playerNotifier` and `container.mixerService`) and never imports `container` (config values arrive through deps or `lib/` getters such as `lib/ttsConfig.ts` and `lib/aiChatConfig.ts`). `BotApplication.setupServices` is the only place outside Sapphire pieces that reads `container` or `getConfig()` to wire them, and the services stay reachable as `container.<name>`. AI tools are built through `createAiTools(deps)` (`services/aiTools/index.ts`) and the chat pipeline through `createAiChat(deps)` (`services/aiChatService.ts`). The audio playback services are `AudioService`, `MixerService`, `SponsorBlockService`, `SkipPolicy`, `PlaybackReporter` and `createPlaylistPlayback(deps)`, reached as `container.audioService`, `container.mixerService`, `container.sponsorBlockService`, `container.skipPolicy`, `container.playbackReporter` and `container.playlistPlayback`; `modules/audio/**` pieces keep using `container` and call them there (the former module-level `reportPlaybackEvent`, `reportNodeEvent`, `skipPolicy`, `sponsorBlockService` and `playSavedTracks` exports are gone). `SERVICES_CONTAINER_ALLOWED` in `architecture.test.ts` is empty and stays empty.
- Other code imports a feature only through its `index.ts`.
- Discord component and modal custom IDs are declared once with `defineCustomId` (`lib/customId.ts`) in the owning module or feature (`modules/audio/customIds.ts`, `modules/general/customIds.ts`, `features/<name>/discord/customIds.ts`, `lib/confirmationId.ts`). Views `encode`, handlers `decode` in `parse()` and return `none()` for unknown IDs (no legacy-format branches). Never build or split IDs by hand; see `component-view`.
- Mutable state (maps, sets, debounce/interval/timeout handles, in-flight registries) never lives in module scope. Put it in a class instance (or a `createXxx()` closure) built once in `BotApplication.setupServices` and reached through `container.<service>`; free functions may delegate to it to keep caller signatures stable. If the owner holds anything that must be written somewhere (debounced saves, buffered writes, queued reports) or any timer, it implements `Stoppable` (`lib/lifecycle.ts`: `name`, `stop()`) and is pushed to `container.stoppables` right after it is created (`PlayerNotifier` in `setupAudio`). `stop()` must flush pending data now (cancel the debounce and write), clear timers, await in-flight writes, and refuse new work afterwards. `core/shutdown.ts` runs every `stop()` after the Redis subscribers stop and before `redisStore.flushPendingWrites()`/`disconnect()` and the DB disconnect, each failure logged and isolated, the whole step bounded by `STOPPABLES_TIMEOUT_MS`. Per-key timers can use `KeyedTimers` (`lib/keyedTimers.ts`). Pure caches and rate-limit maps may stay where they are.
- Config is read with `getConfig()` (`lib/config.ts`), never `process.env`. Tests pass a Config (`makeTestConfig`, `setConfigForTesting`).
- User-facing failures in use cases are thrown as `AppError` (`lib/appError.ts`); the central error listeners render them via `lib/errorPresenter.ts`. `UserError` stays for Sapphire preconditions and code not yet migrated.
- `apps/bot/src/architecture.test.ts` (import-rule ratchet) and `core/pieceInventory.test.ts` (snapshot of every piece name and command category) guard this. Allowlists may only shrink; fix the violation instead of growing a list. An intended piece change updates the snapshot in the same commit.
