# SiruBOT Agent Instructions

Discord music bot monorepo (Turborepo + Yarn 4, Node 22+, ESM). Apps: `bot` (Sapphire + lavalink-client), `dashboard` (Next.js, :3000), `shardmanager` (:3001), `data-api` (gateway, Redis hub, LLM jobs, :3002), `storage` (public asset URLs, :3003), `notifier` (stream alerts → webhooks, :3004). Packages: `prisma`, `utils`, `app-kit` (shared Fastify auth/env/logger), `shardclient`.

- Bot work: read `apps/bot/AGENTS.md` first.
- Docs under `docs/` are English; cite file paths, never line numbers. `docs/` holds only documents linked from the root `README.md`; working notes (plans, audits, changelogs) go in `Localdocs/` (gitignored). References: `docs/architecture.md`, `docs/api-{dashboard,data-api}.md`, `docs/setup-dev.md`, `docs/runbook-production.md`.
- Skills: read `.pi/skills/<id>/SKILL.md` before working in its area; don't copy a skill's rules elsewhere. Bot: `sapphire-command`, `component-view`, `discord-components-v2`, `bot-features` (AI chat, TTS, mixer, lyrics, temp voice, games), `bot-ops` (playback, Lavalink, sessions, shards, shutdown). Dashboard: `dashboard-conventions`, `dashboard-ui` (load `antislop-ui` first). General: `repo-infra`, `security-audit`, `ai-slop-cleaner`.

## Branches and PRs

- Branch from `beta`. Never commit directly to `beta` or `main`. PR base is **always `beta`** (`main` is the deploy snapshot; fix with `gh pr edit <N> --base beta`).
- Titles and bodies follow `docs/pr-message-rule.md`: list verification run and what is unverified; UI changes include screenshots.

## Commands

- `yarn generate` (Prisma client) is required before typecheck/build. `yarn dev` runs only the dashboard; `yarn watch` builds everything else. Dashboard `dev` uses `--webpack`, `build` uses `--turbopack`.
- Single test: `yarn workspace @sirubot/bot test src/path/file.test.ts`. If it prints `command not found: vitest`, use `yarn turbo test --filter=@sirubot/bot -- src/path/file.test.ts`.
- Tests use the root `vitest.config.ts`, which aliases `@sirubot/utils` and `@sirubot/app-kit` to **source** (no dist build needed). The dashboard has its own `apps/dashboard/vitest.config.ts`.
- Never run bare `tsc`; `yarn typecheck` builds dependencies first.
- Lint is prettier `--check` everywhere except the dashboard (`eslint --max-warnings=0`). The pre-push hook runs `lint:fix` + typecheck.

## Cross-app communication

Apps never import each other. Contact points: Redis pub/sub, HTTP with a shared key, the shardmanager WS protocol.

- **Redis channel names and schemas live only in `packages/utils/src/redisChannels.ts`**, bundled as contracts in `redisContract.ts` (`defineRedisRpc`, `defineRedisEvent`, `defineRedisGuildEvent`). Never hardcode channel strings; wire strings must stay byte-identical across a rolling deploy (`redisContract.test.ts` pins them).
- **The dashboard never talks to the bot directly.** Bot-bound work goes dashboard API route → data-api (HTTP) → Redis → bot.
- Work needing the bot token or gateway cache uses **request/reply**: publisher sends `*:request` with a `requestId`, only the bot owning the guild replies on `*:response`. Copy an existing pair (data-api hubs built with `createRequestReplyHub`; bot side `createRedisResponder`, handlers in `features/*/inbound/`).
- Live player: bot → `sirubot:player:{guildId}` → data-api `playerHub` → SSE → dashboard. Settings saves broadcast `sirubot:guild-settings:invalidate`.
- Large bodies go in a pending key; the pub/sub message is only a trigger.

## Auth and env gotchas

- Each app has its own `.env`. Never print or commit secrets.
- `Authorization` carries the **raw key, no `Bearer`**.
- data-api, notifier and storage refuse to start without `<APP>_AUTH_KEY ?? AUTH_KEY`. bot, dashboard and data-api share the key; without it the dashboard skips every call and channel/role/player features look like 502s.
- notifier derives its webhook-token encryption key from `AUTH_KEY` when unset: when rotating `AUTH_KEY`, keep the old value or existing rows can't be decrypted.
- storage bakes `STORAGE_PUBLIC_URL` into issued URLs (changing the domain means rewriting stored URLs); persist the `STORAGE_DATA_DIR` volume.
- The dashboard uses `SHARD_MANAGER_AUTH_KEY` with no fallback. An empty shard assignment (`NoShardsAvailableError`) is normal during rolling updates.
- data-api's `OPENAI_COMPATIBLE_API_URL` + `OPENAI_API_KEY` serve translation and custom-command drafts; without a key, translation returns the original text and drafts return 503.
- `LAVALINK_HOSTS`: comma-separated `id_host_port[_password]`.
- `packages/app-kit` logger config hand-mirrors utils `createLogger`; change both together.

## `@sirubot/utils`

- The root barrel includes node-only modules: **server apps only**. The dashboard imports subpaths only (eslint enforces).
- Adding or removing a subpath means editing both `package.json` `exports` and `tsup.config.ts` `entry`.
- Each domain contract is defined once in utils; apps only import it.
