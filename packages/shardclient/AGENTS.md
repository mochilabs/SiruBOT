# shardclient agent instructions (`packages/shardclient`)

Repo-wide rules live in the root `AGENTS.md`. Paths are relative to `packages/shardclient/src/`.

- This package is the bot-side WebSocket client for `apps/shardmanager` (`client.ts`, `core/ws.ts`) and **the single source of the WS protocol** (`ws-types/index.ts`). Both the bot and shardmanager import it.
- Payload types are `z.infer` of the zod schemas in `ws-types/index.ts`. Change the schema, not a parallel interface. Client-sent payloads keep their bounds (non-negative integer shard IDs, capped array length).
- Removed ops stay removed. `ws-types/ws-types.test.ts` pins that `BROADCASTEVAL` (the deleted eval pipeline) is rejected. Don't reintroduce a remote-eval op.
- `NoShardsAvailableError` means the manager has no shard to give right now, which is normal during rolling updates. Callers retry and must not crash.
