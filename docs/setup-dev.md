# Development setup

> **As of**: 2026-11-13

Structure and contracts are in `./architecture.md`. This page is the shortest path to a running local environment.

## Prerequisites

- Node.js 22 or newer and Yarn 4.12.0, managed by Corepack (`corepack enable`)
- PostgreSQL and Redis
- A Lavalink node
- A Discord application with a bot token

## Steps

1. `yarn install`
2. `yarn generate`: generates the Prisma client. **Required before typecheck or build** (`turbo.json` makes `build` depend on `^generate`).
3. Create an env file per app by copying its example: `apps/<app>/.env.example` to `apps/<app>/.env`. All six apps have one (`bot`, `dashboard`, `data-api`, `shardmanager`, `storage`, `notifier`). Never commit the result.
4. `yarn workspace @sirubot/prisma migrate:dev`: applies database migrations.
5. Run what you need:
   - Dashboard: `yarn dev`. It is the only workspace with a `dev` script.
   - Backend apps: `yarn watch` rebuilds them on change but does not start them. Start one in another terminal with `yarn workspace @sirubot/<app> start`.
   - One workspace only: `yarn turbo dev --filter=@sirubot/dashboard`, `yarn turbo run watch --filter=@sirubot/bot`.

## Ports

| App | Port | Source |
|---|---|---|
| dashboard | 3000 | Next.js default |
| shardmanager | 3001 | `PORT` default in `apps/shardmanager/src/config/env.ts` |
| data-api | 3002 | `PORT` default in `apps/data-api/src/config/env.ts` |
| storage | 3003 | `PORT` default in `apps/storage/src/config/env.ts` |
| notifier | 3004 | `PORT` default in `apps/notifier/src/config/env.ts` |
| bot (health only) | 8080 | `HEALTH_PORT` default in `apps/bot/src/lib/config.ts` |

## Environment essentials

- `LAVALINK_HOSTS` is a comma-separated list of `id_host_port[_password]`, for example `main_localhost_2333_youshallnotpass`. The parser is `packages/utils/src/lavalinkHosts.ts`; a malformed value stops the bot before it boots.
- The data-api key is `DATA_API_AUTH_KEY ?? AUTH_KEY`. The bot, the dashboard and data-api must share it. Callers send the raw key in `Authorization`, with no `Bearer` prefix.
- Without that key the dashboard skips every data-api call (`apps/dashboard/src/lib/data-api/client.ts`), so player, channel and role features fail.
- In development the bot runs standalone on shard 0 and needs neither `SHARD_MANAGER_URL` nor `AUTH_KEY`. In production both are required (`apps/bot/src/core/shardIdentity.ts`).
- Values that must match across apps are listed in `./architecture.md#10-environment-variables`. Variable names and defaults live in each app's `.env.example` and zod schema.

## Slash command registration

With `REGISTER_COMMANDS=true` the bot overwrites the registered commands on startup; otherwise it only logs the difference. To sync by hand:

```bash
yarn dlx tsx scripts/register-commands.ts [--dry-run] [--global|--guild <id>]
```

When no guild id is given, the script falls back to `GUILD_ID` or `DEV_GUILD_IDS` from the environment (`scripts/register-commands.ts`).

## Verification commands

| Command | Notes |
|---|---|
| `yarn lint` / `yarn lint:fix` | The dashboard runs `eslint . --max-warnings=0`; everything else runs `prettier --check` |
| `yarn typecheck` | Builds dependencies first through Turborepo. Do not run bare `tsc` |
| `yarn test` | `vitest run --passWithNoTests` per workspace |
| `yarn workspace @sirubot/bot test src/path/file.test.ts` | A single test file. If it prints `command not found: vitest`, use `yarn turbo test --filter=@sirubot/bot -- src/path/file.test.ts` |

Notes:

- Tests use the root `vitest.config.ts`, which aliases `@sirubot/utils` and `@sirubot/app-kit` to source, so no dist build is needed. The dashboard has its own `apps/dashboard/vitest.config.ts`.
- The pre-push hook (`.husky/pre-push`) runs `lint:fix` and `typecheck`.
- The dashboard's `dev` script uses `--webpack` and its `build` script uses `--turbopack` (`apps/dashboard/package.json`).
