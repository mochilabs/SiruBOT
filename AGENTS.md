# SiruBOT (시루봇) — Project Agent Instructions

## Project Overview

SiruBOT is a production-grade Discord music bot for Korean-speaking communities, built as a TypeScript monorepo with Turborepo.

## Tech Stack

| Layer | Technology |
|---|---|
| Bot Framework | `@sapphire/framework` v5 + `discord.js` v14 |
| Music/Audio | `lavalink-client` v2 + Lavalink server |
| Database | PostgreSQL via `@prisma/client` v7 + `@prisma/adapter-pg` |
| Cache/Queues | `@redis/client` v5 |
| Dashboard | Next.js 16 (App Router) + React 19 + Tailwind CSS 4 |
| Shard Manager | Fastify v5 + WebSocket |
| Validation | `zod` v4 |
| Logging | `tslog` |
| Monitoring | `@sentry/node` + `@sentry/profiling-node` |
| Build | `tsup` (SWC) + Turborepo |
| Package Manager | Yarn v4 (Corepack, node-modules linker) |

## Monorepo Structure

```
apps/
  bot/           — Sapphire Discord bot (music + general commands)
  dashboard/     — Next.js 16 web dashboard
  shardmanager/  — Fastify WebSocket shard distributor
packages/
  prisma/        — Prisma schema + client
  shardclient/   — WebSocket client for shard communication
  utils/         — Shared utilities (constants, formatting, embeds)
```

## Code Conventions

### TypeScript
- Strict mode enabled (extends `@sapphire/ts-config` with extra-strict + decorators)
- ESM modules (`"type": "module"`)
- Node.js v22+
- Use `.ts` extension in imports within the bot app
- Use `@sapphire/decorators` `@ApplyOptions` for configuration

### Commands
- File: `apps/bot/src/modules/<module>/commands/<name>.ts`
- Class: `NameCommand extends Command`
- Use `registerApplicationCommands` for slash command registration
- Localize with `ko` (primary) and `en-US` (fallback)
- Always `deferReply()` before async operations
- Throw `UserError` for user-facing errors

### Preconditions
- File: `apps/bot/src/modules/<module>/preconditions/<Name>.ts`
- Extend `AllFlowsPrecondition`
- Implement `chatInputRun`, `contextMenuRun`, `messageRun`
- Return `this.ok()` or `this.error({ message, context: { ephemeral } })`

### Listeners
- File: `apps/bot/src/modules/<module>/listeners/<name>.ts`
- Extend `Listener` with `@ApplyOptions<Listener.Options>({ event: Events.X })`

### Interaction Handlers
- File: `apps/bot/src/modules/<module>/interaction-handlers/<name>.ts`
- Extend `InteractionHandler` with `InteractionHandlerTypes.Button` or `.SelectMenu`
- Parse custom IDs in `parse()`, handle in `run()`

### Services
- `apps/bot/src/services/` — Business logic layer
- Access via `this.container.<serviceName>`
- Services: `audioService`, `guildService`, `trackService`, `playlistService`

### Korean Language
- All user-facing strings are in Korean
- Command descriptions, error messages, embed text — all Korean
- Use `setNameLocalizations({ ko: '...' })` and `setDescriptionLocalizations({ ko: '...' })`

### Components
- Use Discord Components V2: `MessageFlags.IsComponentsV2`
- Build with `ContainerBuilder`, `TextDisplayBuilder`
- Use `DEFAULT_COLOR` from `@sirubot/utils` for embed colors

### Error Handling
- User errors: throw `UserError` with `identifier`, `message`, `context: { ephemeral: true }`
- Unexpected errors: caught by framework, reported to Sentry
- Unhandled rejections: caught in `environment.ts`, sent to Sentry

### Database
- Schema: `packages/prisma/src/schema.prisma`
- Models: Guild, Track, User, GuildTrackHistory, Playlist, PlaylistTrack
- Access: `this.container.db` (PrismaClient instance)
- Generate client: `yarn prisma generate` (in packages/prisma)

### Redis
- Session persistence for Lavalink nodes
- Queue storage via `QueueStoreManager`
- Access: `this.container.redisStore`

### Lavalink
- Manager: `this.container.audio` (LavalinkManager instance)
- Custom player class: `apps/bot/src/modules/audio/lavalink/player/customPlayer.ts`
- Redis store: `apps/bot/src/modules/audio/lavalink/redisStore.ts`
- Auto-play: `apps/bot/src/modules/audio/lavalink/autoPlayRelated.ts`

## Build & Dev

```bash
yarn dev          # Run all apps in dev mode (Turborepo)
yarn build        # Build all apps
yarn lint         # Prettier check
yarn lint:fix     # Prettier write
yarn typecheck    # TypeScript type check (per app)
```

### Per-app commands (from apps/bot/):
```bash
yarn lint         # prettier --check "src/**/*.ts"
yarn lint:fix     # prettier --write "src/**/*.ts"
yarn typecheck    # tsc --noEmit
yarn build        # tsup
yarn watch        # tsup --watch
```

## Important Files

- `apps/bot/src/core/botApplication.ts` — Bot client class, service/DB/Redis/audio setup
- `apps/bot/src/core/setup.ts` — Plugin registration, command registry config
- `apps/bot/src/core/environment.ts` — Env loading, Sentry init, error handlers
- `apps/bot/src/core/logger.ts` — tslog configuration with sub-loggers
- `packages/prisma/src/schema.prisma` — Database schema
- `turbo.json` — Turborepo task pipeline
- `Dockerfile` — Multi-stage build (bot, dashboard, shardmanager)
- `docker/docker-stack.yml` — Production Docker Swarm stack
- `docker/docker-stack-infra.yml` — Infrastructure stack (Redis + PostgreSQL)

## Security

- Never commit bot tokens, database URLs, Redis passwords, or Sentry DSN
- Environment variables loaded via `@skyra/env-utilities` from `.env`
- `.env` is gitignored
- Owner-only commands use `OWNERS` env array
- Sentry captures all unhandled errors

## Testing

- No test framework currently configured
- CI runs `prettier --check` for linting
- Type checking via `tsc --noEmit`
