---
name: repo-infra
description: Conventions for packages/prisma schema and migrations, packages/utils shared helpers, yarn/turbo pipeline, pre-push hooks, shardmanager server, CI workflows, and Sentry/logging.
---

# Repo Infrastructure

## Prisma (`packages/prisma`)
- Schema `src/schema.prisma`, migrations `src/migrations/`. After schema changes run `yarn workspace @sirubot/prisma migrate:dev`. `yarn generate` is required before typecheck/build. No lint script for prisma.

## Utils (`packages/utils`)
- Add shared helpers here; apps import from it — grep before duplicating inside an app.
- Subpath rule: adding/removing a subpath (precedents: `/time` `/storage` `/playerWeb` `/playerLimits` `/weather` `/delivery` `/client` `/redisContract`) requires editing `package.json` **exports** AND `tsup.config.ts` **entry** together (emits `dist/*.{js,cjs,d.ts}`).

## Monorepo
- Workspace deps use `"*"`, never `"workspace:*"` (corepack Yarn v4).
- Turbo: `build` dependsOn `^typecheck ^generate ^build`; `typecheck` on `^build ^generate`; `test` needs `^generate ^build`. Common build base: `scripts/tsup.config.ts` (ESM).
- Lint matrix: prettier (tabs, single quotes, printWidth 150, trailingComma none) for bot/data-api/shardmanager/storage/notifier/packages; **dashboard = eslint --max-warnings=0**; prisma = none.
- pre-push hook: lint:fix + typecheck.

## ShardManager (`apps/shardmanager`)
- Entry `src/index.ts` (`main: dist/index.js`), server `src/server.ts` (`ShardManagerServer`), config `src/config`, shard registry `src/core/shardRegistry.ts`, routes `src/routes/{api,ws}`, `src/plugins` (auth only). Fastify WebSocket; bot's `ShardClient` performs identify. Protocol changes must be reviewed together with `packages/shardclient`. Auth via `AUTH_KEY`, fail-closed. Shard allocation/failover is bot-ops territory.

## CI/CD (`.github/workflows/`)
- `lint.yml`: `yarn install --immutable` → lint → typecheck → build → test.
- `docker-beta.yml` / `docker-publish.yml` / `docker-branch.yml` (PR test images via the `docker-build` label): image matrix covers all six apps — review fully on Dockerfile, secret injection, or tag-rule changes. Never commit plaintext secrets.

## Sentry / Logging
- Real init lives in `packages/utils/src/sentry.ts`; `apps/bot/src/core/sentry.ts` is a re-export shell + shard-tag helper. `apps/bot/src/core/environment.ts` loads `.env` and registers the process-level handlers; bot env values are parsed only in `apps/bot/src/lib/config.ts` (`getConfig()`).
- Standard logger: `@sirubot/utils` logger — no direct `console.log`. Non-`UserError` exceptions go to Sentry.

Always state how a change affects turbo cache/build order/pre-push/deployment first; for protocol/schema changes, specify old/new coexistence strategy during rolling updates.