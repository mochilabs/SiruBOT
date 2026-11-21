<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Before writing code, always read

1. **Context7 docs** — for any library, framework, SDK or API the task touches (including Next.js itself), fetch the current docs via the Context7 MCP tool first. Training data may be stale; the docs are the source of truth.
2. **Skills** — `dashboard-conventions` for pages, API routes, hooks and stores; `dashboard-ui` for visual work.

## Dashboard-only rules

- Import `@sirubot/utils` by subpath only (eslint enforces; see `packages/utils/AGENTS.md`).
- Bot-bound work goes through data-api (root `AGENTS.md`, cross-app communication). Server-only env lives in `src/lib/env.ts` and never reaches the client bundle.
- `SHARD_MANAGER_AUTH_KEY` has no fallback key. API reference: `docs/api-dashboard.md`.

## Run and test

- Dev server: `yarn dev` from the root (or `yarn workspace @sirubot/dashboard dev`) on port 3000, with webpack. `.claude/launch.json` has the same `dashboard` entry for the preview pane. Production build uses turbopack (`yarn workspace @sirubot/dashboard build`), so a change can pass `dev` and still fail `build`.
- Minimum env: `DATABASE_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`. `NEXT_PUBLIC_*` values are inlined at build time.
- Most pages need Discord sign-in; server pages also need you to manage that guild. Channel, role and player features need data-api and a bot that owns the guild.
- Lint is eslint (`--max-warnings=0`), not prettier. Tests use `apps/dashboard/vitest.config.ts`, not the root config. Its default environment is `node`; a file that needs the DOM opts in with a `// @vitest-environment happy-dom` comment. Example: `yarn workspace @sirubot/dashboard test src/components/servers/music-settings.test.tsx`.
