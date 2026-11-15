# shardmanager agent instructions (`apps/shardmanager`)

Repo-wide rules live in the root `AGENTS.md`. Paths are relative to `apps/shardmanager/src/` unless they start with `apps/` or `packages/`. Overview: `apps/shardmanager/README.md`.

## Layout

- Bot processes connect over WebSocket (`routes/ws/index.ts`) and receive shard IDs. `core/shardRegistry.ts` owns the assignment state. The dashboard reads shard status over HTTP (`routes/api/shards/`).
- The WS message types and zod schemas live in `packages/shardclient/src/ws-types/`, shared with the bot. Change the protocol there, never with local types here.

## Env and behavior

- Env schema: `config/env.ts`. `SHARD_COUNT` is `auto` or a positive integer. `SHARDS_PER_PROCESS` defaults to 5.
- `ALLOCATION_GRACE_MS` (default 40 s) holds back new assignments right after startup, so bots that were already running reconnect to their old shards first. Keep it longer than the client's reconnect backoff (max 30 s).
- The HTTP key is `AUTH_KEY` (no per-app override). The dashboard sends it as `SHARD_MANAGER_AUTH_KEY`, with no fallback. `/api/health` is the only unauthenticated path.
- An empty assignment (`NoShardsAvailableError` on the bot side) is normal during rolling updates.
