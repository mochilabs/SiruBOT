# Production runbook

> **As of**: 2026-11-13

Architecture and contracts are in `./architecture.md`; the cross-app environment table is `./architecture.md#10-environment-variables`. This page covers operational behavior only.

## Docker build and run

- The root `Dockerfile` has six final targets: `bot`, `dashboard`, `shardmanager`, `data-api`, `storage`, `notifier`. The `builder-*` stages are intermediate.
- `docker/` holds `docker-compose.yml` (local example), `docker-stack.yml` (apps) and `docker-stack-infra.yml` (infrastructure).
- Dashboard `NEXT_PUBLIC_*` values (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_DISCORD_CLIENT_ID`, `NEXT_PUBLIC_SUPPORT_SERVER`, `NEXT_PUBLIC_TOS_URL`, `NEXT_PUBLIC_PRIVACY_POLICY_URL`) are inlined at build time, so runtime env cannot change them. The docker workflows pass them as build args from GitHub variables with the same names. `docker-beta.yml` runs in the `beta` environment and `docker-publish.yml` (releases) in the `production` environment, so set per-environment values under Settings > Environments > (environment) > Environment variables; a repository-level variable (Settings > Secrets and variables > Actions > Variables) is the fallback when an environment does not define one. Unset variables fall back to code defaults, so the Open Graph base URL and image resolve to localhost until `NEXT_PUBLIC_APP_URL` is set. Changing a value requires rebuilding the dashboard image.
- Docker build cache lives in GHCR, not the GitHub Actions cache: each app image has a `:buildcache` tag (written by `docker-beta.yml`) and release builds write `:buildcache-release` while reading the beta cache as a fallback. The tags are build artifacts, never deploy targets. If a build behaves oddly after a Dockerfile change, delete the app's `buildcache` tag from the package page to force a cold build.
- Branch test images: add the `docker-build` label to a same-repo PR and `docker-branch.yml` builds all six apps from the PR head, tagged `<branch-slug>` and `<branch-slug>-<short-sha>` (for example `ghcr.io/mochilabs/sirubot-bot:refactor-bot-architecture`), rebuilding on every push while the label stays. It runs in the `beta` environment, reads the beta build cache and writes `:buildcache-branch`. Manual dispatch only works once the workflow exists on `main`. These images set `GIT_BRANCH` to the branch name, so the bot runs `prisma migrate deploy` only (the beta-only `db push` does not run). Remove the label to stop rebuilds and delete old branch tags from the package page.
- The bot image runs `prisma migrate deploy` on startup. When `GIT_BRANCH=beta` it also runs `prisma db push --accept-data-loss`, which syncs schema changes that have no migration file (`Dockerfile`). Release and branch images never run `db push`.

## Required environment (production)

- Without `SHARD_MANAGER_URL` the bot exits immediately, and with it set, `AUTH_KEY` is also required (`apps/bot/src/core/shardIdentity.ts`). Development mode runs standalone on shard 0 and skips both checks.
- data-api, storage and notifier refuse to start without their auth key (`<APP>_AUTH_KEY ?? AUTH_KEY`).

## Rolling updates and shard incidents

- On `NoShardsAvailableError` the bot retries identify forever, every `SHARD_IDENTIFY_RETRY_MS` (default 5 s, minimum 1 s), waiting for the old process to release its slot (`apps/bot/src/core/shardIdentity.ts`, `apps/bot/src/lib/config.ts`). An empty assignment during a rolling update is normal.
- `ShardClient.identify()` itself retries a failed connection every 5 s and times out waiting for `IDENTIFY_ACK` after 10 s (`packages/shardclient/src/client.ts`).
- After a dropped connection the client reconnects with exponential backoff: 1 s, 2 s, 4 s, up to a 30 s cap (`packages/shardclient/src/client.ts`).
- shardmanager tracks assignments and failures with `ShardRegistry` and reports them through `DiscordNotifier` to `DISCORD_WEBHOOK_URL` (`apps/shardmanager/src/server.ts`).

## Shutdown order

- **bot** (`apps/bot/src/core/shutdown.ts`): close the health server → save Lavalink node sessions to Redis → clean up the Lavalink handler and audio listeners → stop the shared Redis subscription (`container.redisSubscribers`) → stop state owners in `container.stoppables` (flush pending writes, clear timers; capped at 5 s by `apps/bot/src/lib/lifecycle.ts`) → flush the pending-write journal → disconnect Redis → disconnect the database → destroy the gateway client → destroy the shard client → flush Sentry.
- **data-api** (`apps/data-api/src/server.ts`): stop both schedulers → stop the eight hubs (player, bot-profile, greeting, guild-data, player-web, jtc, bot-admin, panel) → disconnect Redis → disconnect the database → close Fastify.
- **shardmanager** (`apps/shardmanager/src/server.ts`): destroy the registry → close Fastify.
- **storage** (`apps/storage/src/index.ts`): close Fastify. It has a local volume only, with no database or other connection.
- **notifier** (`apps/notifier/src/index.ts`): stop the poller, the scheduler, the Twitch scheduler and the hub → disconnect the database → disconnect Redis → close Fastify.

Session save happens before Redis disconnects on purpose: changing the bot's order loses player sessions across a restart.

## What the in-memory fallback means

- data-api's `sharedCache` falls back to a process-local `Map` when Redis is unavailable (`apps/data-api/src/utils/cache.ts`). Cached entries are lost on restart, and with several replicas each instance keeps its own copy.
- If the bot's shared Redis subscription fails, the bot keeps booting; only the dashboard integrations time out (`apps/bot/src/core/redisSubscribers.ts`). During an incident this looks like "the bot is alive but the dashboard cannot reach it".

## Health checks

| App | Endpoint | Container check (`Dockerfile`) | Source |
|---|---|---|---|
| bot | `GET /` on `HEALTH_PORT` (default 8080), 200 or 503 | HTTP 200 | `apps/bot/src/core/healthServer.ts` |
| data-api | `GET /api/health`, the only unauthenticated path | HTTP ok | `apps/data-api/src/routes/index.ts`, `apps/data-api/src/plugins/auth.ts` |
| shardmanager | `GET /api/health` returns `{ ok: true }`, unauthenticated | TCP connect to 3001 | `apps/shardmanager/src/routes/api/health/health.ts` |
| dashboard | none | TCP connect to 3000 | `Dockerfile` |
| storage | `GET /health` returns `{ ok: true }`. Unauthenticated paths are `/health` and public object GET | HTTP ok | `apps/storage/src/routes/health.ts`, `apps/storage/src/routes/objects.ts` |
| notifier | `GET /health` returns `{ ok: true }`. Unauthenticated paths are `/health` and the platform callback routes | HTTP ok | `apps/notifier/src/routes/health.ts`, `apps/notifier/src/routes/pubsub.ts`, `apps/notifier/src/routes/eventsub.ts` |

The bot answers 503 until it is first ready. After that it keeps answering 200 through a gateway reconnect for up to 2 minutes, so a brief reconnect does not trigger a restart loop (`apps/bot/src/core/healthServer.ts`).
