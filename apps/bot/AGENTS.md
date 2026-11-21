# Bot agent instructions (`apps/bot`)

Repo-wide rules live in the root `AGENTS.md`. Paths are relative to `apps/bot/src/` unless they start with `apps/` or `packages/`.

## Layout

- Relative imports **always include the `.ts` extension**. All user-facing strings are Korean.
- `discord/` holds bot-wide Sapphire pieces; everything else is a `features/<name>/` folder: `index.ts` (public surface, the only import path for other code), `application/` (use cases), `discord/{commands,listeners,interaction-handlers,views}`, `inbound/` (Redis responders and event listeners). Music adds `lavalink/`. Dashboard responders with no single owning feature go in `features/dashboard-bridge/`.
- Every piece root is listed once in `PIECE_ROOTS` (`core/pieceRoots.ts`); a new root goes there.
- Entry: `index.ts → core/setup.ts → core/bootstrap.ts → core/botApplication.ts`. `BotApplication.setupServices` wires every service and the single shared Redis subscription (responders and event listeners go there only).
- Command registration: `REGISTER_COMMANDS=true` overwrites, otherwise it only logs. Manual sync: `yarn dlx tsx scripts/register-commands.ts [--dry-run] [--global|--guild <id>]`.
- Custom commands: the spec/name/prefix contract lives only in `packages/utils/src/customCommand.ts`; re-validate the spec with zod before running it; `!도움말` is reserved; create/edit/delete only from the dashboard with `role: "manage"` (saving broadcasts the invalidate, which clears the cache and re-syncs slash commands).
- Shutdown order directly affects session loss. Read `bot-ops` before touching it.

## Rules for new code

- Entry points (slash, buttons, listeners, responders, AI tools) are thin adapters over `application/` use cases.
- `application/` never imports Sapphire, views, pieces, `src/discord/` or config.
- Services (`services/`, feature `application/`, music `application/`) take a `deps` object (db, `AppLogger`, other services, config values, lazy getters for things created later in boot) and **never import `container` or call `getConfig()`**. Only `BotApplication.setupServices` and Sapphire pieces read `container`; services are reached as `container.<name>`. Feature factories (`createTicketService(deps)` etc.) are the pattern; music controls (`container.music`) are the reference.
- `features/music/lavalink/**` never imports `container`: it takes `LavalinkDeps` (`features/music/lavalink/deps.ts`, exposed as `container.lavalink`); helpers take `deps` first.
- Discord objects in services are narrow ports (`MemberPermissionPort` in `lib/discordPorts.ts`, or a small interface next to the service), converted at the piece/responder. Services that only drive Discord keep discord.js types.
- Messages a service posts on its own go through a render port implemented in the feature's `discord/` folder (e.g. `features/tickets/discord/ticketMessages.ts`).
- Custom IDs: declare once with `defineCustomId` (`lib/customId.ts`); never build or split IDs by hand. Collectors: use `createComponentSession` (`lib/componentSession.ts`), never a hand-rolled collector plus `settled` flag. Details in `component-view`.
- No mutable state (maps, sets, timers, in-flight registries) in module scope: put it in an instance built in `setupServices`. An owner of timers or pending writes implements `Stoppable` (`lib/lifecycle.ts`) and is pushed to `container.stoppables` when created; `stop()` flushes now, clears timers, awaits in-flight writes and refuses new work (per-key timers: `KeyedTimers`, `lib/keyedTimers.ts`). Pure caches and rate-limit maps may stay.
- Config comes from `getConfig()` (`lib/config.ts`), never `process.env`. Tests use `makeTestConfig` / `setConfigForTesting`.
- User-facing failures in use cases throw `AppError` (`lib/appError.ts`); `UserError` stays for preconditions.
- Guards: `architecture.test.ts` (import-rule ratchet) and `core/pieceInventory.test.ts` (piece snapshot). Allowlists may only shrink: fix the violation instead of growing a list. An intended piece change updates the snapshot in the same commit.

## Run and test

- Start: `yarn workspace @sirubot/bot build && yarn workspace @sirubot/bot start` (runs `dist/`). Minimum env: `DISCORD_TOKEN`, `DATABASE_URL`, `REDIS_URL`, `LAVALINK_HOSTS`. Without `NODE_ENV=production` it runs standalone on shard 0 and needs no shardmanager.
- Health: `GET /` on `HEALTH_PORT` (8080) returns 503 until the client is first ready (`core/healthServer.ts`).
- Optional features turn off when their env is empty: AI chat (`CHAT_MODEL`), TTS (`SIRU_TTS_URL`), emoji maker (`SIRU_MOJI_URL`). Gateway features need `DATA_API_URL` and the shared data-api key.
- Single test: `yarn workspace @sirubot/bot test src/core/pieceInventory.test.ts`. Run `architecture.test.ts` and `core/pieceInventory.test.ts` after moving files, adding a piece or adding an import across folders.
- Adding, removing or renaming a command or piece: update `EXPECTED_PIECES` / `EXPECTED_COMMAND_CATEGORIES` in `core/pieceInventory.test.ts`, then check registration with `yarn dlx tsx scripts/register-commands.ts --dry-run`. Dev-only commands register to `DEV_GUILD_IDS`.
- Playing YouTube or testing the mixer needs a Lavalink node with the plugins in `docs/3rdparty.md` §1; the compose Lavalink has none.
