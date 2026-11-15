<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Before writing code, always read

1. **Context7 docs** — for any library, framework, SDK or API the task touches (including Next.js itself), fetch the current docs via the Context7 MCP tool first. Training data may be stale; the docs are the source of truth.
2. **Skills** — `dashboard-conventions` for pages, API routes, hooks and stores; `dashboard-ui` for visual work (load `antislop-ui` first).

## Dashboard-only rules

- Import `@sirubot/utils` by subpath only (eslint enforces; see `packages/utils/AGENTS.md`).
- Bot-bound work goes through data-api (root `AGENTS.md`, cross-app communication). Server-only env lives in `src/lib/env.ts` and never reaches the client bundle.
- `SHARD_MANAGER_AUTH_KEY` has no fallback key. API reference: `docs/api-dashboard.md`.
