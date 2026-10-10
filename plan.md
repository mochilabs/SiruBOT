# SiruBOT — Haskell-Inspired Codebase Analysis & Optimization Plan

- **Baseline**: branch `analysis/haskell-inspired-optimization-plan` @ `bb9eab6` (identical to `beta`)
- **Date**: 2026-10-10
- **Scope**: Planning only — no source changes were made on this branch.
- **Method**: opencode semantic index (4,673 chunks / 462 files, verified `ready`; repaired once after branch switch via `index_codebase`) + five parallel analyst passes (architecture, type-system, correctness/concurrency, performance, testing). Every Tier-1 finding was independently re-validated against source before inclusion.
- **Validation tags**: **V** = independently validated in source, **PV** = partially validated, **NV** = analyst evidence only (not personally re-read).

---

## 1. Executive Summary

The architecture is fundamentally sound: a clean 4-app topology (bot / dashboard / **data-api** / shardmanager), well-documented Redis channel contracts in `packages/utils`, typed error classes, tested infra utilities, and a real (under-used) vitest suite — 13 test files exist, contrary to AGENTS.md's "stub" claim.

The risk is concentrated in **one place: the queue/player persistence and recovery state machine** in `apps/bot/src/modules/audio/lavalink/`. This is a hand-rolled distributed state machine (Redis + in-memory fallback + pending-write journal + watchdog timers) whose invariants are enforced mostly by comments, duplicated between two almost-twin classes that have **already diverged** — `CachedPlayerSaver` got a data-loss fix; its twin `CachedQueueStore` did not. The worst defects are small, validated, and cheap to fix:

1. **Permanent queue data loss** on a Redis blip (`pendingWrites.clear()` runs even when SETs failed) — F-01.
2. **Silent per-guild playback stall**: the watchdog's recovery chain ends in `.catch(() => null)` and never re-arms on failure — F-03.
3. **Indefinite hangs**: Lavalink REST calls with no timeout, serialized behind per-guild promise chains — F-04.
4. **Permanent orphaned temp-voice channels** with no restart rehydration — F-02.

Second-order opportunities are textbook Haskell principles, already half-present in the codebase: a shared player-state protocol package (the payload is currently hand-triplicated across 3 apps), Prisma enums replacing stringly-typed modes, a typed player-data store replacing `setData/getData<any>`, discriminated unions for the ~10 scattered lifecycle booleans, and pure-domain/IO separation in `trackHandler` (684 lines, 26 methods, 28 `container` refs). Performance findings are real but mostly second-order (O(n²) full-queue serialization on playlist ingest is the notable one) and several need measurement before acting.

---

## 2. Repository Architecture

### Subsystems

| Subsystem | Responsibility | Key evidence |
|---|---|---|
| `apps/bot` (Sapphire/Discord.js, TS ESM strict) | Gateway events, slash commands (audio/general/voice/games), Lavalink client, queue persistence, voice utils | `core/bootstrap.ts:17-268` orchestration kernel; `core/botApplication.ts:78-86` service wiring |
| `apps/data-api` (undocumented in AGENTS.md) | Canvas image rendering (10 renderers), external providers (lyrics/weather/translation/packaging), 3 Redis hubs, playback stats, LLM batch jobs | `routes/index.ts` (~704 lines, ~25 endpoints), `services/playerHub.ts` |
| `apps/dashboard` (Next.js 16) | UI + zod-validated API routes; thin proxy to data-api for live state; direct Prisma for player history/settings | `src/app/api/**`; `lib/data-api.ts` |
| `apps/shardmanager` (Fastify WS) | Shard allocation (in-memory registry), heartbeats, broadcast-eval, stats aggregation | `core/shardRegistry.ts:24-267` |
| `packages/shardclient` | WS client protocol: identify/re-identify/reconnect, stats, remote eval | `src/client.ts:50-193` |
| `packages/utils` | Shared helpers incl. **Redis channel contracts** (`redisChannels.ts:13-63`), `MemoryCache`, format/time/env | `utils.test.ts` |

### Critical flows (validated)

1. **Playback + persistence**: command → `audioService` → `LavalinkManager` (`CustomPlayer`, `CachedQueueStore` as `queueStore`, `botApplication.ts:128-131`) → every queue mutation forces a library `save()` → full-queue JSON → Redis SET (`queueStore.ts:64-85`) → Redis blip switches to `pendingWrites` journal (`queueStore.ts:72-84`).
2. **Live state**: `playerStatePublisher` → Redis pub/sub `sirubot:player:{guildId}` (`redisStore.ts:208`) → `playerHub` (data-api, in-memory + SSE) → dashboard SSE proxy (`live/stream/route.ts`).
3. **Settings invalidation**: dashboard Prisma upsert → data-api `/v1/internal/guild-settings/invalidate` → Redis channel → bot subscriber → `guildService.invalidate` with generation guard (`guildService.ts:46-78`) — this one is defensively well-designed.
4. **Lifecycle**: shard identify (double retry loop, F-15) → sequential startup (DB → Redis → 3 subscriber services → login → Lavalink) → health server `everReady/unreadySince` grace machine (`bootstrap.ts:222-247`) → shutdown saves sessions → cleanup → Redis → DB → `process.exit(0)` (`bootstrap.ts:102-143`).

### High-coupling hotspots

- `trackHandler.ts`: 684 lines, 26 methods, 28 `container.` refs — lifecycle events + mixer wiring + watchdogs + reconcile timers + state publishing + notifications (F-13).
- Global `container` from Sapphire: services, stores, and handlers all resolve dependencies from a single mutable hub (typed by a 70-line augmentation, `types/global.d.ts`).
- `routes/index.ts` (data-api): ~25 endpoints with inline zod schemas in one 704-line file.
- **Layering inversion**: `services/audioService.ts:4-8` imports from `modules/audio` (subcommands, views) while `trackHandler.ts:8-9` imports back from `services/` — the services↔modules boundary is bidirectional (F-12).

**Coverage caveats**: full read depth on bot audio core, services, shardmanager, shardclient, data-api infra; signature-level only on `aiChatService/aiTools` and dashboard UI; lavalink-client vendored internals read at call-sites only.

---

## 3. Findings

### Tier 1 — Correctness / data integrity (validated defects; recommended first)

**F-01 · Dropped pending writes = permanent queue loss** — `correctness` · `apps/bot/src/modules/audio/lavalink/queue/queueStore.ts:134-163` · **V**

- Evidence: each pending SET has its own `.catch` (only logs, :151-153); then `await Promise.allSettled(promises); this.pendingWrites.clear()` (:158-159) runs **unconditionally** — failed writes are erased. The outer `try/catch` :161-163 is dead code (`allSettled` never rejects). The twin `CachedPlayerSaver` was already fixed with exactly the right pattern and comment: *"실패한 쓰기는 지운다 하면 데이터가 영구 소실된다"* (`playerSaver.ts:146-161`).
- Problem: any transient Redis failure during reconnect = user queues lost forever.
- Root cause: fix applied to one of two diverged copies (a copy-paste twins problem).
- **FP insight**: the "did it work?" question must be a value, not a side effect observed in a comment — a sync that returns how many keys survived makes this state representable and impossible to mis-clear.
- Recommendation: port the playerSaver loop (retain failed keys, guard newer-value overwrite, report synced/failed counts); consider extracting a shared `JournalRedisStore` base so the twins can't diverge again.
- Confidence **high** · Impact **high** · Effort **S** · Risk: none (pure repair, existing test precedent `guildService.test.ts:7-12`).
- Verification: unit test — fail one SET via mocked client, assert key remains in `pendingWrites` after `syncPendingWrites()`; run on every CI.

**F-02 · Temp-voice channels orphaned forever** — `correctness/resource-leak` · `apps/bot/src/services/tempVoiceService.ts:146-163` (+ no rehydration on startup) · **V** (finally-block logic), NV (rehydration absence)

- Evidence: `deleteIfEmpty`'s `finally { this.rooms.delete(channelId); … }` (:159-161) executes even on the early `return` at :154 when **humans are still present**. From then on `checkEmpty` (:93-100) and join-clear only work for `rooms.has(...)` → the populated room is never tracked, never deleted. Additionally `rooms`/`emptyTimers` are in-memory only; every restart orphans all tracked rooms (no READY reconcile).
- **FP insight**: `finally` as cleanup is wrong when the function can exit early in a *non-terminated* state; "empty" and "checked-and-terminally-empty" are 2 distinct states folded into 1 boolean map.
- Recommendation: only untrack when the channel is genuinely gone (deleted) or terminated-empty; re-arm `checkEmpty` in the human-detect branch; add READY-time reconcile over cached guild settings.
- Confidence high (logic) · Impact **high** (user-visible channel leak) · Effort **S/M** · Verification: integration test with fake guild channel states; manual: create room → join → let grace timer fire → assert still tracked.

**F-03 · Watchdog recovery dies silently and permanently** — `correctness` · `apps/bot/src/modules/audio/lavalink/handlers/trackHandler.ts:569-587` · **V**

- Evidence: recovery chain `clearNext().catch(()=>null).then(primeForPlay().catch(()=>null)).then(() => player.play({noReplace:true})).then(() => this.armWatchdogUnlessStarted(player))` ends in terminal `.catch(() => null)` (:587). If `player.play` rejects, the terminal catch eats it **and `armWatchdogUnlessStarted` never runs** → no further watchdog cycles for that guild until a user command. The comment at :556 ("다음 주기에 다시 시도") describes a loop that doesn't exist on the failure path. No Sentry report (contrast `base.ts:18-37`).
- **FP insight**: "ignore and retry later" requires *constructing the later*; swallowing the failure destroys the continuation. Model the watchdog as a state machine step that always transitions (retry / give-up-with-log), never as a dangling promise.
- Recommendation: log + `Sentry.captureException` in the terminal catch; on `play` rejection re-`armWatchdog` with backoff.
- Confidence high · Impact **high** · Effort **S** · Verification: fake timers + rejecting player mock; assert re-arm happens and error is reported.

**F-04 · Lavalink REST calls have no timeout; serialized chains can hang forever** — `reliability` · `apps/bot/src/services/mixerService.ts:63-82` (with `enqueueSlotOperation` :217-229) · **V**

- Evidence: `fetch(`${base}${path}`, …)` — no `signal`, no timeout. All mixer slot ops (`preloadUpcoming`, `clearNext`, skip's slot-clear, `/믹서` `getState`) queue behind a hung call → slash command can never complete (3s defer auto-fails while the op stays queued).
- Recommendation: adopt the repo's own precedent `AbortSignal.timeout` (`dataApiClient.ts:55`) — e.g. 5s; fail with `MixerRequestError` so callers can degrade.
- Confidence high · Impact **high** · Effort **S** · Verification: blackhole a node port; assert 5s abort + warn + command completes with error message.

**F-05 · Persistence state machine: unguarded `get()` + stale-overwrite race on reconnect** — `correctness/concurrency` · `queueStore.ts:35-46,122-127`, `playerSaver.ts:127-131` · **V** (structure), PV (race window)

- Evidence: (a) `get()` awaits Redis with no try/catch while `queue.set/delete` both guard (:39 vs :72-84) — a rejection lands raw inside lavalink-client queue internals; (b) `onConnect()` flips `isRedisConnected = true` then fires non-awaited `syncPendingWrites()`; a concurrent `get()` reads stale Redis values and `cache.set` overwrites the newer memory value (window between event and SET completion).
- Recommendation: guard `get()` (catch → mark disconnected → serve from `MemoryCache`); flip `isRedisConnected` only after sync completes, or cache-first read during sync.
- Confidence high (structure)/medium (race frequency) · Impact **medium-high** · Effort **S** · Verification: fault-injection unit tests; property test: "get never rejects and never returns a value older than the last local `set`".

**F-06 · Non-atomic pending-key claim (duplicate bot-profile/greeting applies)** — `concurrency` · `apps/bot/src/services/botProfileService.ts:153-156`, `memberGreetingService.ts:196-198`; unused helper `redisStore.ts:163-175` · **V** (helper exists), NV (claim sites)

- Evidence: comment claims "읽은 즉시 지워요 — 중복 적용을 막아요" but GET-then-DEL is two ops: under rolling restart (two replicas with the same guild) or two rapid broadcasts, both GET before either DELs → duplicate `guild.members.editMe` PATCHes / duplicate greeting sends. `setCacheValueNX` exists yet unused; it also degrades to `true` when Redis is down ("보호 불가") — silently.
- **FP insight**: "claim a job exactly once" is an atomic primitive (`GETDEL`/Lua), not a two-step protocol that relies on interleaving never happening.
- Recommendation: use `GETDEL` (or Lua; verify server supports 6.2+, else Lua `GET+DEL`); make the Redis-down degradation explicit (log + state channel).
- Confidence high · Impact **medium** · Effort **S** · Verification: two concurrent subscriber handlers with mocked Redis asserting single apply.

**F-07 · Shutdown drops in-flight writes and false-discloses success** — `lifecycle/data-integrity` · `apps/bot/src/core/bootstrap.ts:102-143`; `redisStore.ts:36-49` · **V**

- Evidence: shutdown neither flushes `queueStore`/`playerSaver` `pendingWrites` nor calls `client.destroy()`; `sessionStore.save` is a **silent no-op** when `isRedisConnected=false` (redisStore :41-44) while bootstrap logs `Saved session for node …` unconditionally (:107-111). Partial success is hidden from operators.
- **FP insight**: effects that may not happen must return "did I actually happen?" — `Maybe`/`Result`-shaped returns instead of unconditional logs.
- Recommendation: flush pending journal before `redis.disconnect()` (bounded, e.g. 2s); have `save()` return a boolean; log outcomes truthfully; optionally `client.destroy()` per Sapphire lifecycle.
- Confidence high · Impact medium (deploy-window transitions) · Effort **M** · Verification: shutdown test with Redis down; log inspection in staging deploy.

**F-08 · Reconcile timer can silently revert a concurrent /skip** — `correctness` · `trackHandler.ts:486-510` · **PV** (restoration snippet confirmed; race analysis NV)

- Evidence: the 800ms reconciliation restores `queue.current` and re-queues the displaced track; guards cover `stopByCommand` and `lastStartedEncoded`, but `/skip` never sets `stopByCommand` (`commands/stop.ts:38` only). Own comment admits the REST path's race window (`trackHandler.ts:304-311`).
- Recommendation: suppress reconcile for N ms after a mixer skip, or verify server active-track via REST before overwriting (pattern already used in the watchdog path).
- Confidence medium · Impact medium · Effort **M** · Needs **Phase-0** evidence (lavalink skip semantics + event ordering).

**F-09 · Concurrent skip/vote-skip double-execution** — `concurrency` · `mixerService.ts:321-324`, `voteSkip.ts:33-40,120-133` · **NV** (medium confidence)

- Two `/skip`s or rapid votes before `hasTrackChanged()` flips can double-advance (skip is not serialized; vote collectors are per-invocation). Suggest guild-wide skip mutex + vote state keyed by track id. Frequency depends on lavalink-client internals → measure first.

**F-10 · Temp-voice creation races** — `concurrency` · `tempVoiceService.ts:165-216` · **V** (a, b), NV (c)

- (a) guild-wide `creating` guard silently discards a second concurrent joiner (:167, no notification — user stranded at marker); (b) `rooms.set` then unprotected `await member.voice.setChannel(channel)` (:189-190) → failure reports "만들지 못했어요" while the channel exists and stays tracked with no empty timer → orphan; (c) `handleOwnerLeave` successor pick may target a stale-cache member (NV).
- Recommendation: scope the guard per-member; catch the move failure and either adopt-by-timer (arm `checkEmpty`) or delete; revalidate successor against fresh cache.
- Confidence high · Impact medium · Effort **S** · Verification: unit tests on the state machine; property: "every tracked room always has either members or an armed empty timer".

### Tier 2 — Architecture & coupling

| ID | Finding | Location (evidence) | Recommendation | Conf / Impact / Effort |
|---|---|---|---|---|
| F-11 | Redis pub/sub scaffolding duplicated ~6× (bot ×3 + data-api ×3: connect/backoff/`end`→reconnect/stop, ~70-90 lines each) | `guildSettingsInvalidator.ts:67-131`, `botProfileService.ts:80-120`, `memberGreetingService.ts:118-160`, `playerHub.ts:135-203`, `botProfileHub.ts`, `memberGreetingHub.ts:110-154` | One `RedisSubscriber` helper in `packages/utils` (+ reconnect/backoff/stop policy) | H / M / M |
| F-12 | Services↔modules bidirectional boundary | `audioService.ts:4-8` imports subcommands/views; `trackHandler.ts:8-9` imports services | Shared utils (youtubeChapters, ohaasa) move down to packages; skip-decision/view rendering moves up into command layer | H / M / M |
| F-13 | Hub overload: trackHandler (684 ln/26 methods/28 `container` refs), data-api routes/index.ts (~704 ln/~25 endpoints, inline zod), aiChatService (1,108 ln) | listed files | Split by responsibility (event-lifecycle vs recovery vs publishing); route modules per domain | H / M / ML |
| F-14 | Dual service-wiring systems: 7 container services vs 3 file-scope singletons started/stopped from hand-maintained lists | `botApplication.ts:78-86`, `bootstrap.ts:125-127,173-179`; absent from `global.d.ts` | One registry: all services in container, single `startAll/stopAll` with typed ownership | M-H / M / S |
| F-15 | Double retry policy around identify + no cap/early health | `client.ts:50-119` (internal 5s loop) vs `bootstrap.ts:46-60` (outer loop, different policy split), `botApplication.ts:107` `retryAmount: 9999`; health server bound only after full boot (:245) | Single retry policy inside ShardClient as a parameter; bind health server before identify; alert on retry counters | V / M / S |
| F-16 | Now-playing card render does a **synchronous cross-app HTTP fetch in the track-start hot path** | `nowPlayingCard.ts:10` → `dataApiClient.ts:182-198` | Render async after trackStart announces; cache by fingerprint; keep failure-degrade | M / M / M |

### Tier 3 — Types & invariants

| ID | Finding | Location | Recommendation (which invalid states become unrepresentable) | Conf / Effort |
|---|---|---|---|---|
| F-17 | **Player-state protocol hand-triplicated** (bot `playerStatePublisher.ts:18-45`, data-api `playerHub.ts:25-51` raw `JSON.parse`, dashboard `live/route.ts:16-63`) + magic channel `sirubot:player:{guildId}` in 3 files (`redisStore.ts:208`, `playerHub.ts:20,94`) + unchecked `fetchDataApi<T>` casts (`lib/data-api.ts:36-142`) | as listed | One `@sirubot/player-protocol` package: shared zod schema + `playerStateChannel(guildId)` helper; data-api parses inbound pub/sub, dashboard validates proxied responses. Field drift/channel drift/wrong-shape become compile or boundary errors | H / L-M |
| F-18 | Prisma string-typed enums + sentinel writes: `repeat String @default("off")` (:24), `pinnedChannelMode` (:28), `aiMode` (:41), `Track.source` (:59); `trackData.ts:6-10` writes `''`/`'(제목 없음)'` sentinels into non-null columns; 3× duplicated RepeatMode validation (`guildService.ts:125-131`, `playerHandler.ts:44-45`) | as listed | Prisma `enum`s for modes; nullable columns instead of sentinels; single smart-constructor parse. Invalid `RepeatMode` strings, triple invariant copies, and phantom titles become unrepresentable | H / M (migration) |
| F-19 | Untyped player data bag: `getData<T>` unchecked; 3 keys scattered over 6 files (`trackHandler.ts:55,152,266,317,336,481,492`; `autoPlayRelated.ts:289`); `stopByCommand` set but only cleared at trackStart | as listed | Typed `PlayerStateStore` object on `CustomPlayer` (3 named fields). Wrong-typed values, typo'd keys, and the forever-`stopByCommand` state become impossible | H / L |
| F-20 | `Track` vs `UnresolvedTrack` duck-typing: ~20 `as` casts (`trackHandler.ts:258,386-401,422-437,480-503,515`; `autoPlayRelated.ts:275-326`); `undefined !== "xyz"` encodes as mismatch | as listed | `hasEncoded(): t is Track` guard + `TrackRef` smart value for identity comparisons. False mismatch-comparisons disappear | H / M |
| F-21 | ~10 scattered lifecycle booleans encode multi-state machines: health (`bootstrap.ts:224-241`), 4 independent Redis "connected" flags (`redisStore.ts:100/19`, `playerSaver.ts:9`), notifier revalidation ×4 in one flow | as listed | Discriminated unions `Liveness = Booting\|Healthy\|Reconnecting{since}\|Down`, `ConnState = Ready\|Syncing{pending}\|Degraded\|Down`. Invalid flag combinations become unrepresentable | H / M |
| F-22 | Sentinel literals + string-split env: `'related_track'` ×8, `LAVALINK_HOSTS` manual `split('_')` with `parseInt` no-radix (`bootstrap.ts:187-207`) | as listed | Branded `RELATED_TRACK_REQUESTER_ID`; zod schema → `LavalinkNodeConfig[]` smart constructor; malformed env can't construct | H / L |
| F-23 | Error taxonomy conflated: infra failures surfaced as `UserError` strings (`audioService.ts:83-92,107-113`); ~20 `.catch(() => null)` in audio scope hide infra vs domain; good typed classes (`MixerRequestError`, `GatewayDomainError`, `DeliveryError`) exist but are bypassed at call sites | as listed | Domain-only `UserError`; typed infra errors propagate; terminal `catch(() => null)` must log or capture (Sentry). Distinguish retryable infra from user failures | H / M |

### Tier 4 — Performance (classification per mission)

| ID | Finding (classification) | Location | Recommendation & measurement |
|---|---|---|---|
| F-24 | **Strongly-indicated**: full-queue JSON serialize + whole-value Redis SET per mutation; library saves at ~20 sites; `removeStaleRelatedTracks` splices per item → O(n²) playlist ingest; unbounded value size (7-day TTL, `queueStore.ts:15`) | `queueStore.ts:64-85`, `autoPlayRelated.ts:56-58` | Cap queue length at add-time; move to per-track Redis list/hash with delta writes; batch splice ranges. Measure first: `redis MONITOR` during 1,000-track playlist add (payload sizes/frequency), event-loop lag |
| F-25 | Strongly-indicated: `/playlist add` = 4-5 sequential Prisma RTTs inside the awaited command; `trackStart` upsert+insert unbatched (2 RTTs, fire-and-forget) | `playlistService.ts:71-117`, `trackService.ts:34-47` | Single `$transaction`; verify with Prisma query-log durations |
| F-26 | Strongly-indicated, low magnitude: Prisma `query` events constructed per query in production | `botApplication.ts:58-67` (data-api's client omits it, `db.ts:16`) | Gate `{level:'query'}` behind LOGLEVEL/dev |
| F-27 | Hypothesis: full `CustomPlayer.toJSON()` per `playerUpdate` + a second stringify + O(n) queue filter per event | `playerHandler.ts:85`, `playerStatePublisher.ts:114-127` | Debounce playerSaver; compute scan once. Measure playerUpdate frequency first (MONITOR) |
| F-28 | Hypothesis (structurally certain, magnitude unmeasured): fully sequential startup — DB → Redis → 3 subscribers → login; per-node sequential session GETs | `bootstrap.ts:163-182`, `botApplication.ts:94-101` | `Promise.all` DB+Redis; parallelize subscribers; measure phase timestamps + docker restart MTTR |
| F-29 | Hypothesis: `GuildTrackHistory` unbounded (insert/trackStart, zero retention) + dashboard per-request `count`/`groupBy` | `trackService.ts:41-47`, dashboard `player/route.ts:38-45` | `EXPLAIN ANALYZE` at current rowcount; then retention policy or per-guild counters |
| F-30 | Hypothesis (capacity-only): playerHub O(n) sort per message at 5,000 entries | `playerHub.ts:106-110` | Periodic sweep instead of per-message sort (MemoryCache eviction O(n) in `packages/utils/src/memoryCache.ts:71-92` folds in here) |

### Tier 5 — Testing & verification

| ID | Finding | Evidence | Recommendation |
|---|---|---|---|
| F-31 | **CI runs neither tests nor typecheck** | `.github/workflows/lint.yml:29-33` = install + prettier only; 13 test files exist (`apps/bot` ×8, `data-api` ×3, `utils`, `shardclient`); `turbo.json:36-39` has a real test task; all workspaces define `vitest run --passWithNoTests` | Add `yarn typecheck` + `yarn test` to CI; keep `--passWithNoTests` only for empty packages |
| F-32 | Documentation drift | AGENTS.md claims "`yarn test` is a stub" — **stale** (refuted); `apps/data-api` (a whole app) absent from AGENTS.md's app list | Update AGENTS.md; document data-api ownership/flows |

### Minor cleanup (Phase 4 batch)

`controllerButton.safeUpdate` writes controller message-ids outside the notifier's serialization chain (clobber race); `playerSaver.get` unguarded `JSON.parse` (:71-75); `incrementCacheCounter` INCR/EXPIRE non-atomic (TTL-less key on crash, `redisStore.ts:181-187`); `MemoryCache` comment/behavior mismatch ("oldest" is actually LRU) + O(n) eviction; duplicated carrier-ID regex in `delivery.ts:101-108,213`; `shardRegistry` broadcast JSON-stringify per send (:196-205).

---

## 4. Proposed Design

The intended end-state keeps the current topology (no new apps) and repairs its weakest seams:

1. **Persistence as an explicit state machine** (fixes F-01/02/03/05/07): one shared `JournalRedisStore` base (or a small `RedisConnState` union: `Ready | Syncing { pending } | Degraded | Down`) owned by both queue-store and player-saver; every sync returns `{ synced, failed }`; every `save()`/`set()` returns success-ness; shutdown consumes the journal before disconnect. The watchdog becomes an explicit `WatchdogState` transition table (`Observing{round} | Recovering{attempt} | Idle`) — every terminal step either re-arms or escalates with a report, making "silent stall" unrepresentable.
2. **Protocol as data, not convention** (F-17 + ARCH-3/4): `packages/player-protocol` with one zod schema (`PlayerStatePayload`), `playerStateChannel(guildId)`, `pendingKey(guildId)`. Bot serializes, data-api validates on ingest, dashboard validates on proxy. Also `GETDEL`-based claim helpers for the F-06 pending-key protocol.
3. **Types at the boundaries** (F-18/19/20/22): Prisma enums for mode strings; typed `PlayerStateStore`; `TrackRef` + `hasEncoded` guard; zod env parsing into `LavalinkNodeConfig[]` at boot (fail-fast before login).
4. **Pure core / effectful shell in trackHandler** (F-13 + F-23): extract the *decision* logic — reconcile/restore decisions, now-playing mismatch handling, mixer-skip bookkeeping — into pure functions over a `PlaySnapshot` value (current/queue/flags/encoded-refs), unit-testable without container, Lavalink, or timers; IO (REST, timers, notifications) stays in the handlers calling them. This is where F-08's fix lands naturally: a pure `decideRestore(snapshot, serverActive)` with explicit inputs incl. the `skipPendingUntil` timestamp.
5. **One subscriber primitive, one service registry** (F-11, F-14): shared `RedisSubscriber` in `packages/utils`; unified service lifecycle (`startAll/stopAll`) so shutdown order is data, not a hand-maintained comment.

No framework-level effect systems are proposed — the Sapphire `container` already provides wiring; the value is in *narrowing* it (fewer singletons, typed state, explicit protocols), not adding indirection.

---

## 5. Optimization Roadmap

### Phase 0 — Investigation (blocking questions)

| Task | Feeds | Method |
|---|---|---|
| 0.1 Read vendored lavalink-client: `utils.save` call ordering, `player.skip` semantics, `changeNode` sync-ness | F-08, F-09, F-15 | Source read of pinned version |
| 0.2 Telemetry: playerUpdate frequency, queue-length histogram, Redis SET payload sizes | F-24, F-27 | `redis MONITOR` + counters |
| 0.3 `EXPLAIN ANALYZE` on `GuildTrackHistory` count/groupBy at production rowcount | F-29 | psql |
| 0.4 ESM import-cycle check (`madge --circular` or typecheck) | F-12 | CI-able static check |
| 0.5 Verify Redis version (>=6.2 for `GETDEL`) | F-06 | `redis.info()` |
| 0.6 Confirm whether `TrackInfo` nullable in practice (library types vs runtime) | F-18, F-20 | Live probe or library tests |

### Phase 1 — High-value fixes (validated, low-risk, mostly <1 day each; independent)

1. **F-01** queue-store sync fix (template: `playerSaver.ts:146-161`) + regression test.
2. **F-03** watchdog self-healing (log/Sentry + re-arm) + fake-timer test.
3. **F-04** mixer `AbortSignal.timeout` + error propagation.
4. **F-05** guarded `get()` + sync-order fix (same file as F-01; same PR acceptable).
5. **F-10** tempVoice creation fixes (a)/(b); **F-02** tracking fix (rehydration in Phase 2).
6. **F-26** gate Prisma query logging.
7. **F-31** CI: add `yarn typecheck` + `yarn test` (**land first** — gives every later fix a safety net).
8. **F-06** atomic claim (`GETDEL`/Lua) after 0.5.

### Phase 2 — Structural (type modeling, boundaries, effects)

1. **F-17** `packages/player-protocol` (foundation for 3 apps; low migration risk — ship with dual-accept read).
2. **F-07** shutdown honesty (journal flush + truthful logs) — depends on F-01's journal API.
3. **F-02** tempVoice restart rehydration (READY reconcile) — depends on Phase-1 F-02 fix.
4. **F-19** typed `PlayerStateStore`; **F-22** env zod + branded related-track id; **F-20** `TrackRef` guard (unblocks the clean F-08 fix).
5. **F-11** shared `RedisSubscriber`; **F-14** unified service registry (shutdown order as data).
6. **F-15** consolidate identify retry; early health bind.
7. **F-08** restore/skip race fix (`decideRestore` pure function + `skipPendingUntil`) — after 0.1/0.2.
8. **F-12**, **F-23** boundary cleanup + error taxonomy.

### Phase 3 — Performance (measurement-gated; each starts with its Phase-0 evidence)

1. **F-24** queue payload redesign (cap → list/hash delta writes; coordinated rollout with data-api/dashboard consumers via F-17's protocol versioning).
2. **F-25** transaction batching (`/playlist add` latency, p50/p95 before/after).
3. **F-28** parallel startup (boot-time target from 0.2 baseline).
4. **F-27** debounce playerSaver + single queue-scan per render.
5. **F-29** retention policy (only if 0.3 shows degradation); **F-30** hub sweep.
6. **F-16** async now-playing-card render (after latency measurement).

### Phase 4 — Follow-up

**F-13** hub splitting (trackHandler, routes/index.ts, aiChatService); **F-18** Prisma enum migration (schema + data migration; schedule with a maintenance window); **F-21** discriminated-unions rollout beyond Redis (health machine); **F-32** docs update; minor-cleanup batch (§3 Tier list).

Dependencies: F-01→F-07; F-08+0.1→Phase-2; F-17→F-24 rollout; **F-31 lands first** (zero risk, unlocks verification of everything else).

---

## 6. Testing & Benchmarking Strategy

- **Exists (verified)**: `yarn test` → turbo fan-out → per-workspace `vitest run --passWithNoTests`; root `vitest.config.ts` (node env, 10s timeout, source alias for `@sirubot/utils`); 13 test files, incl. real DI precedent (`guildService.test.ts:7-12` mocks Sapphire's `container`); `breaker`/`dedup`/`memberGreetingCard` tests in data-api; `yarn typecheck` (turbo, `dependsOn ^generate`).
- **Missing regression coverage** (test-first targets, priority order): F-01 pending-write retention; F-05 get-robustness + stale-overwrite ordering; F-03 watchdog re-arm under rejecting `play`; F-04 abort paths; F-02/F-10 tempVoice state machine ("every tracked room has members or an armed timer" — good property); F-06 single-claim under two handlers; F-07 shutdown flush order; F-17 protocol round-trip (bot↔data-api↔dashboard payloads).
- **Property-based tests** (fast-check — absent from the repo, small root-only install): `formatTime`/`formatTimeToKorean` round-trip (`packages/utils/src/time.ts`), `chunkArray` (composition + size bounds, `array.ts`), `MemoryCache` LRU/TTL invariants (`memoryCache.ts`), greeting template substitution no-leak (`memberGreeting.ts`), `filterYouTubeSuggestions` idempotence/dedup (`youtube.ts`).
- **Benchmarks/experiments**: redis `MONITOR` + payload-size histogram (F-24/F-27); Prisma query-log timing sums (F-25); `EXPLAIN ANALYZE` (F-29); docker `events` + phase timestamp logs (F-28); `node --inspect` event-loop lag during large-queue playlist add; heap diff on player destroy/leave loops (leak check for controller messages).

---

## 7. Risks & Trade-offs

- **Cross-app coordination**: F-17/F-24 change a protocol consumed by 3 independently-deployed images. Ship a versioned payload (keep legacy read path) and dual-accept writes for one deploy cycle. The dashboard is read-only here, so the blast radius is data-api+bot.
- **Redis version dependency** for `GETDEL`; fallback = Lua script (same atomicity, more code) — unresolved until 0.5.
- **Prisma enums (F-18)** require a data migration over existing string values + read-side compat for old rows; medium regression risk, schedule as its own release.
- **Queue-store redesign (F-24)** must satisfy lavalink-client's `QueueStoreManager` interface; delta-writes change failure semantics — keep the pending-journal guarantee (F-01) in the new design, not just the old one.
- **Shutdown flush (F-07)** competes with the 30s `stop_grace_period` (`docker/docker-stack.yml:22-23`); cap the flush (e.g. 2-3s) and log truncation.
- **Early health-server bind (F-15)** changes docker healthcheck semantics (`start_period` interplay) — coordinate with `docker-stack.yml:11-16`.
- **Alternative considered and rejected**: full effect-monad-style refactor of the bot core — high indirection cost, weakly justified in TS by current evidence; targeted DI seams (pure decision functions, injected stores) deliver the testability at a fraction of the migration risk.
- **Unproven-by-me items**: F-09 (double-skip), F-11's full 6-site duplication, and F-16's latency magnitude rest on analyst evidence only — treat as medium-confidence until Phase-0 checks.

---

## 8. Highest-Value Next Action

**F-01 — fix `CachedQueueStore.syncPendingWrites` data loss** (`queueStore.ts:134-163`).

Why first: (a) it is a *validated, permanent data-loss* defect triggered by ordinary infrastructure conditions (Redis blip during deploy/rolling restart); (b) the fix template already exists in-repo (`playerSaver.ts:146-161`) — minimal diff, minimal risk; (c) verification is immediate and cheap (fault-injection unit test using the precedent in `guildService.test.ts:7-12`); (d) it unblocks the shared journal refactor (F-01→F-07) that Phases 1-2 organize around. Land F-31's CI test step in the same PR so the new regression test has teeth.

---

## 9. Unresolved Questions

1. **Production distribution of queue lengths / playlist sizes and `playerUpdate` frequency?** Decides the real impact of F-24/F-27 — needs telemetry (0.2).
2. **What does the pinned lavalink-client version actually do on `skip()` / `changeNode()` / `save()` ordering?** Determines severity of F-08/F-09 and the correctness of the double-retry consolidation (0.1).
3. **Which Redis version runs in production?** Gates `GETDEL` vs Lua for F-06.
4. **Are lavalink `TrackInfo` fields truly nullable at runtime** (bot's defensive fallbacks vs library's non-optional types)? Decides whether F-18's fix belongs in the schema/sentinels or in a library type patch (0.6).
5. **`aiChatService.ts` (1,108 lines) was audited only at signature level** — if AI chat is in scope for the next hardening pass, it needs its own deep review.
6. **Is the Redis memory-fallback mode ever active in production?** (Whether `REDIS_URL` can be absent in prod decides how hard F-05's cache-first semantics must be tested.)

---

## 10. Implementation Progress

- **Branch**: `analysis/haskell-inspired-optimization-plan` — Phase 1~2 배치 커밋 완료(f90fd77 F-01~07 계열, 28a8077 F-32·F-23).

### 2026-10-10 — Phase 1 batch 1 (done, verified)

- **F-01 + F-05**: 신규 `apps/bot/src/modules/audio/lavalink/pendingWriteSync.ts` (공용 저널 플러시: 실패 쓰기 보존 + 최신값 가드). `queueStore.ts`/`playerSaver.ts` — `get()` 캐시 폴백 가드, 재연결 경합 제거(sync 완료 후 flip + drain), 직접 쓰기/삭제 성공 시 stale pending 제거, 쌍둥이 코드 공용화.
- **F-03**: watchdog 복구 실패 시 로그 + Sentry + 재무장 (`trackHandler.ts` terminal catch 교체).
- **F-04**: mixer REST `AbortSignal.timeout(MIXER_CALL_TIMEOUT_MS)` env-조절 + `MixerRequestError` 정규화 (`mixerService.ts`).
- **F-02 (1단계) + F-10**: `deleteIfEmpty` 추적 유지(사람 재등장/삭제 실패 시 재스케줄), `scheduleEmptyCheck` 헬퍼 도출; 멤버 단위 생성 락 + 이동 실패 시 유예 타이머 부착 (`tempVoiceService.ts`).
- **F-26**: Prisma `query` 이벤트 로깅을 `LOGLEVEL >= 4`에서만 (`botApplication.ts`).
- **F-31**: CI에 `yarn typecheck` + `yarn test` 스텝 추가 (`.github/workflows/lint.yml`).
- **검증**: `yarn vitest run` 14 files / **91 tests passed** (신규 `queueStore.test.ts` 4개 포함), `turbo lint --filter=@sirubot/bot` PASS, `turbo typecheck --filter=@sirubot/bot` PASS.

### Newly discovered during implementation (follow-up)

1. **Disconnected delete resurrection**: 단절 중 `delete()`는 pendingDeletes 톰스톤이 없어 Redis DEL이 보류되지 않음 — 재연결 시 삭제된 큐/플레이어가 Redis 잔존값으로 되살아날 수 있음 (queueStore·playerSaver 공통, 소규모 수정). F-01 계열 후속.
2. F-02 2단계(rooms 재동작 READY reconcile)는 Phase 2 그대로 유지.
3. F-06(GETDEL 원자 클레임)은 Phase 0.5 Redis 버전 확인 후 착수.
4. tempVoice 소유자 승계(successor) 검증(COR-9c)은 미착수 (임시 캐시 의존 — 별도 검토 필요).

### Remaining

- **Phase 1**: 없음 (F-06만 0.5 대기).
- **2026-10-10 — Phase 2 진행 중**:
  - **F-17 완료** (player-state 프로토콜 단일화): 스키마 계약을 `packages/utils/src/playerState.ts`로 단일 정의 (`playerStateSchema`/`playerStateResponseSchema` + zod v4). 새 패키지 대신 utils 배치 — 3 앱이 모두 이미 의존해 yarn.lock 변경 0. ① bot: `playerStatePublisher.ts` 로컬 인터페이스 삭제(타입 import), `redisStore.ts` 채널 리터럴 → `playerStateChannel()`. ② data-api: `playerHub.ts` 로컬 인터페이스 2종 + `guildIdFromChannel` 삭제, Pub/Sub 인바운드 `safeParse` 검증 추가. ③ dashboard: `live/route.ts` 재선언 삭제 → utils 재출력(alias 유지로 컴포넌트 무변경), 프록시 응답 `safeParse` 검증. ④ 계약 테스트 `packages/utils/src/playerState.test.ts` (4개). ⑤ turbo `typecheck`에 `^build` 추가 — CI 신규 typecheck가 dist 없는 신규 클론에서 깨지는 문제 예방.
  - **F-07 완료** (shutdown 진실성): `NodeSessionStore.save` → 실제 기록여부 `Promise<boolean>` 반환, 거짓 "Saved session" 로그 제거(부트 `nodeHandler`의 fire-and-forget 호출도 호환); 종료 시 `flushPendingWrites()`(queueStore+playerSaver 저널 플러시)를 Redis disconnect 전에 수행; `client.destroy()` 추가.
  - 검증: `yarn turbo typecheck` 전 워크스페이스 9/9 PASS, `yarn turbo lint` 전부 PASS(dashboard eslint 포함), vitest 15파일/**95테스트** 통과.
- **2026-10-10 — 사용자 요청 추가 완료 (dashboard)**:
  - 모바일 서버선택(`/servers`) 행 컴팩트화: `GuildCard` 모바일에서 설치 상태줄("이미 시루봇이 있어요"+ShieldCheck) 숨김(`hidden md:flex`), 모든 행동 버튼을 **아이콘 전용**(w-11=44px 타겟 + aria-label)로 축소 — md 이상 데스크톱은 기존 텍스트 버튼 유지. 사용자 인증 헤드리스로 라이브 클릭킹은 불가, 코드검증(eslint --max-warnings=0 · tsc)으로 통과.
  - **F-19 완료** (typed PlayerStateStore): `CustomPlayer.transitionState` (`TransitionState`: stopByCommand/lastStartedEncoded/preloadConsumedAt) — 무형 `setData/getData` 문자열 키 22사이트·6파일 전부 마이그레이션, 약한 타입 경계 노출 1건(라이브러리 `encoded?: string`)을 안전 대입으로 수정. 직렬화 무영향 확인(toJSON 명시 spread, 복구 경로에 data 재현 없음 → 프로세스 로컬 동일성 유지). vitest bot 9파일/56테스트 통과.
  - **F-22 완료**: ① `packages/utils/src/lavalinkHosts.ts` 신설 — `parseLavalinkHosts(raw, globalPassword)` zod 스마트 생성자, 부트스트랩 인라인 파서 대체(형식 오류도 동일 메시지/시점 유지, `defaultPasswordUsed` 플래그로 warn 유지, parseInt radix 보정); 테스트 3개. ② `'related_track'` 센티널 → `requester.ts`의 `RELATED_TRACK_REQUESTER_ID` 브랜드 상수 (autoPlayRelated 4·view/controller 1·audioService 1·trackService 1 교체) + 검증 안 된 requester 캐스트 2건(autoPlayRelated:364,378)을 타입 안전 `requesterIdOf`로 치환 — 동일 판별 의미 유지.
  - **F-11 부분 완료 (봇 계열)**: `packages/utils/src/redisSubscriber.ts` 신설 — `ManagedRedisSubscriber`(전용 연결/바인딩 목록/지수 백오프 5s→60s/stop 래치, 구독 실패 절대 throw 없음). 봇 3 서비스(guildSettingsInvalidator · botProfileService · memberGreetingService)의 중복 connect/error-warn/end-reconnect/start/stop 코드 ~150줄 공용화. **data-api 3 허브(playerHub/botProfileHub/memberGreetingHub)는 의도적으로 미변경** — 시작-루프+auto-resubscribe+패턴 구독이라는 다른 신뢰성 정책(시작 재시도 1s→5s, 상태 플래그 노출)을 갖고 있어 강제 통합은 회귀 위험; 정책 통합은 Phase 4 조사 과제로 유지.
  - **F-14 완료** (서비스 레지스트리 단일화): Redis 구독 3형제를 `container`로 이동 — module-scope 싱글톤 3개 제거, `global.d.ts` Container 증강에 추가, `BotApplication.setupServices()`에서 일괄 생성(로거 어댑터 공용), bootstrap 시작/종료는 `container.<service>?` 경유(부팅 중 SIGTERM 안전 — `?.`), 소비자 리스너 5파일(guildMemberAdd/Remove, botProfileGuildCreate/MemberUpdate/Ready)도 container 경유로 전환. 이제 모든 서비스가 한 레지스트리에 있음(F-14 원해결).
  - **F-12 진행 (컷 1·2 완료)**: ① `dataApiClient`의 modules 재출력 4종(Weather*/Delivery*) 제거 — 소비자(`commands/weather.ts`, `aiTools/weather.ts`)가 modules/utils에서 타입을 직접 import. 게이트웨이 래퍼 함수들(fetchWeather/trackDelivery/fetchOhaasaKo)은 dataApiClient 소유로 유지. ② 순수 유틸 `youtubeChapters.ts`(3종: CHAPTER_FETCH_MIN_DURATION_MS/isYouTubeSource/resolveYouTubeVideoId)를 `packages/utils/src/lavalinkTrack.ts`로 이동 — mixer·trackData(services)가 modules를 위로 import하던 역방향 제거, 소비자 5파일 전환, 원본 삭제. ③ **컷 3 보류(근거)**: audioService의 스킵/플레이 오케스트레이션+뷰 렌더는 ~350줄의 명령 프레젠테이션 결합 — 별도 세션에서 UX 흐름 검증하며 이전해야 해서 plan에 그대로 남김.
  - **F-23 최소 절단**: `connectPlayer` 인프라 실패(`player.connect().catch`)에 `Sentry.captureException` + 태그(layer:player_connect, guild_id) 추가 — UX UserError 계약은 유지하되 인프라 원인은 잃지 않게 (search 절단부 동일 패턴 후속).
- **F-15 진행 보류 (근거 기록)**: double-identify-loop은 실제로는 보완적 2-정책 분할(클라이언트: 연결/ACK 오류 무한 재시도, 봇: NoShardsAvailableError 처리)로 확인 — 단순 병합은 동작 변화를 일으킴. 'cap+알림', 'health 서버 조기 바인드'는 배포 동작(docker healthcheck/start_period/restart 정책)을 바꾸는 변경이라 스테이징 검증 필요 → Phase 0·실제 인프라 검증 대기로 plan상 유지.
  - **F-23 추가 절단**: `search`의 loadType 'error'에도 `Sentry.captureException` 추가(layer: player_search). UI 메시지 전용 `.catch(() => null)`(컨트롤러 갱신류, 관찰상 무해)는 그대로 두기로 결정 — 회복 자체가 실패해 다음 사이클을 죽이는 것만(=F-03)이 치명이라 판단; 근거 plan 기록.
  - **F-32 완료**: AGENTS.md 정정 — data-api를 앱 목록에 추가(책임 설명), "test는 stub" 스테레오 타이입 제거(vitest 분포·CI 스텝 반영), typecheck `^build ^generate`, LAVALINK_HOSTS 파서 위치(`packages/utils/src/lavalinkHosts.ts`), shutdown 순서 갱신(저널 플러시·구독자 stop·게이트웨이 destroy 포함).

### 2026-10-10 — 분산 조사 세션(8 병렬 에이전트: 조사·설계 확정 + 톰스톤 구현 1건)

- **F-08 + F-20 (vendored 조사, 0.1/0.6) — 완료**:
  - 대상은 **lavalink-client 2.10.2**(apps/bot `^2.10.0` 충족). `files: ["dist"]` 배포라 `src` 없음 — `dist/index.mjs`(원본 식별자 보존)·`dist/index.d.ts`로 판독.
  - 0.1 확정: ① `utils.save`는 emit 이전에 await되지만 `Player.play` 트랙 옵션 경로에 floating save 1건(`mjs:5666-5668`) 유실 가능점. ② `skip`은 재시도 없음·**클라 `queue.current` 미접근** — 큐 시프트는 서버 TrackEnd WS 이벤트(`reason!=='replaced'`) 경로(`mjs:2744-2782`). 빈 큐+미재생이면 `play()` 무await floating(`mjs:5971`) — trackHandler 기존 주석(`:577-579`)이 지적했던 지점을 라이브러리 사실로 확정. ③ `changeNode`는 `internal_nodeChanging` 래치 동기화, 같은 Player 인스턴스에서 **트랙 1곡 재시작**(큐는 클라에 잔존)이며 전환 중 trackEnd는 완전 유실(`mjs:2745`), 전환 체인 중 skip은 선행 노드 교체(`mjs:6203`)로 신노드 404 위험.
  - **0.6 결론**: TrackInfo 런타임 nullable 실재(타입은 non-null이나 실증 없음; 라이브러리 자체가 `isNotBrokenTrack` 필터 `mjs:733-738`·`'Unknown title'` 폴백 보정 `mjs:1125-1141` 제공) → **라이브러리 타입 패치 불필요, 봇 경계(trackData nullable 전환)가 정답** — F-18 갈래 A(schema nullable) 근거 확정.
  - **F-08 경합 정밀 확정**: 창 = `[mixerService.skip 진입(mixerService.ts:336-338) ~ trackStart 확정(trackHandler.ts:55-59)] × [800ms 리커널 예약 잔존]` 교집합. 스킵은 stopByCommand·current 모두 건드리지 않아 기존 방어선 3개가 전부 뚫려 복원(`:498-504`)이 스킵된 곡 X를 서버에서 재시작. → fix 설계 확정: 순수 `decideRestore(RestoreSnapshot)` 7분기 결정표(noop / restore-current / adopt-server / finish) + `skipPendingUntil`(mixer.skip 진입 기록 ~3s, trackStart 확정 소멸) — 스킵은 세마포어형 stopByCommand로 표현 불가라 시간 창이 정확한 의미. `transitionState`에 `skipPendingUntil` 필드 추가.
  - **F-20 캐스트 전수 실측**: trackHandler 22소 + autoPlayRelated 7소(plan 누락분 `:580-581·609-610` 포함; plan 근사치 → 실측 695행). → `pure/trackRef.ts` 신설안: `hasEncoded(): t is Track & { encoded: string }`(라이브러리 `isTrack` 계약과 정합 — encoded 문자열 있으면 Track, `mjs:744-748`) + `TrackRef`({kind:'encoded'|'identifier'}) + `sameTrack`(encoded 우선, identifier stale-메타데이터 폴백 비교) — `undefined !== "xyz"` 오판 클래스가 값 차원에서 소멸.
  - **미해결 1건(구현 전 유일 게이트)**: 서버 TrackEnd `reason` 실측 — `/skip` 1회 후 WS 로그 확인. 'stopped'면 시프트 전제·테스트 기대값 확정, 'replaced'면 도달률 변동(fix 설계 자체는 유효 유지).
  - **신규 발견**: `nodeHandler.ts:470` `changeNode(...)` **미await·미catch** — unhandled rejection + orphan 플레이어 폴백 부재. **→ 완료(이번 배치)**: catch+warn 로그로 차단(markUnmanaged는 실존하지 않는 개념이라 로그만).
- **F-06 (설계 확정, 0.5 프로브 대기)**: 클레임 사이트 실측 — `botProfileService.ts:110-112`, `memberGreetingService.ts:153-155` GET→DEL 2 RTT 인터리브(롤링 재시작·대시보드 연속 저장 시 중복 적용). plan 정정: `setCacheValueNX`(redisStore.ts:164-176)는 "unused"가 아니라 **락 용도 2곳 실사용**(`gameRecords.ts:148`, `ohaasaTranslate.ts:133`) — 클레임용은 별도 `claimCacheValue(key)`(GETDEL/Lua 내부 분기) 신설 + 서비스 2곳 치환안. **결정트리**: `redis_version ≥ 6.2` → GETDEL 1 RTT, `<6.2` → Lua 원자 스크립트, 미확인 → Lua 시작 후 승격(부팅 1회 판별 고정). 운영자 프로브 4종 확정(`INFO server | grep redis_version`, `GETDEL __probe:1` 구문 판정 등). `docker-stack-infra.yml:3`은 `redis:alpine` **플로팅 태그** — 버전 미고정, 태그 고정(`redis:7-alpine`) 병행 권고.
- **톰스톤 (F-07 계열 후속 → 완료)**: 저널을 `Map<string, string|null>` **last-op-wins**로 확장 — 단절 중 `delete()`가 톰스톤(null) 기록, DEL 실패 catch 경로도 톰스톤 → 재연결 sync가 DEL까지 소화, Redis 잔존값 부활 차단. `pendingWriteSync.ts`(+null 분기·JSDoc)·`queueStore.ts`(+2 분기)·`playerSaver.ts`(+2 분기). `set-후-delete`/`delete-후-set` 순서 경합이 맵 자체로 소멸. 테스트 +5(queueStore `:56+`, playerSaver.test.ts 신규 2개 — 부활 차단 직결). 검증: vitest **17파일/103테스트 PASS**, `turbo typecheck/lint --filter=@sirubot/bot` PASS(오케스트레이터 재실행 재확인). 한계(수용): 프로세스 크래시 시 톰스톤도 소실 — 기존 저널 동일 한계, 근본 해결은 F-24.
- **F-21 (설계 확정)**: 현행 플래그 전수 매핑 — bootstrap `:213-214`(everReady+unreadySince), redisStore `:101`(isReady), `:19`(NodeSessionStore **초기값 true** — 연결 전부터 true인 왜소한 흐름 발견), queueStore `:11`/playerSaver `:11`(isRedisConnected+저널 — Syncing/Degraded가 같은 1비트에 묻힘), notifier 재검증 `:73,85,89,131`+updateControllerNow ×5 = 9소. → `Liveness = Booting|Healthy|Reconnecting{since}|Down`, `ConnState = Ready|Syncing{pending}|Degraded|Down`, `ControllerState = Live{version}|Stale{version}|Destroyed` 판별 유니온 설계 + 불가능해질 조합 목록 + **4단계 이관 계획**(1. journal 쌍둥이 ConnState → 2. RedisStore/NodeSession → 3. bootstrap Liveness[스테이징 게이트 — docker healthcheck 재시작 증폭] → 4. notifier[F-08 세션 동행 권장]).
- **F-12 컷 3 (설계 확정, 구현 대기)**: 결합부 346 LOC 확정 — (a) 스킵 결정 10 함수(`handleSkip`+서브핸들러 8+술어 4), (b) 재생 뷰 3 함수(`handlePlaylistPlay`/`promptRemainingPlaylist` 수집기 소유/`handleTrackPlay`), 잔류 ~190 LOC(플레이어 생성/connect/search/enqueue 등). 대상 맵: `modules/audio/managers/skipFlow.ts`(~175)·`playFlow.ts`(~205), `preloadAfterQueueChange` private→public 필요, 소비자 skip.ts:117·play.ts:115,120·search.ts:127(원본 interaction 매개변수 동일성 보존). **UX 패리티 체크리스트 9항목**(P1 deferReply 타이밍 불변, P2 UserError 3종 이동+5종 잔류 식별자 대조, P4 수집기 `includes('playlist_')`+deferUpdate 선행 순서, **P7 allowedMentions 억제 10+1처 — 누락 시 실핑 회귀가 최상위 리스크**, P9 플래그 표기 이원화 유지 등). 추출 4단계(베이스라인 스냅샷 → 스킵 컷 → 재생 컷 → madge 수렴; documented residual 1건 `enqueueTrack→autoPlayRelated` 수용 권고). 라이브 클릭킹 불가 유지 — 컷 진행은 정적 diff 대조 기준.
- **F-18 (설계 확정, 유지보수 창 대기)**: Prisma enum 3종 신설(RepeatMode off/track/queue, PinnedChannelMode play/select, AiMode all/channels/off — 값 집합 코드 수집 완료). **Track.source는 enum 전환 금지**(개방형 집합 — 플러그인 접미사 `startsWith('youtube')`, lavalinkTrack.ts:13-15; `'unknown'`은 합법 폴백). 센티널 제거: `Track.title/artist/url` nullable 전환(`trackData.ts:6-11` 실측 — duration 0은 유지, identifier는 무가드 PK라 그대로). **제4 쓰기 사이트 발견**: dashboard `playlists/[id]/tracks/route.ts:106-107` 자체 기본값("Unknown Title"). 마이그레이션 SQL **배치 A→B→C→D 고정**(CREATE TYPE → 무효값 정규화 UPDATE → USING 타입 전환+기본값 재설정 → NOT NULL 해제+센티널 NULL화; Prisma USING 미생성 검증 게이트). plan 정정 — RepeatMode 검증 중복은 "3×"이 아니라 **봇 6+프로토콜 1(playerState.ts:30)+대시보드 3** 사이트(3번째 사이트=`subcommands/repeat.ts:12,47-53` — 동명 `VALID_REPEAT_MODES` 사본). 스마트 생성자: `packages/utils/src/modes.ts` 신설(REPEAT_MODES 등 3상수 + parse/tryParse + cycleRepeatMode) + 전 사이트 치환 계약표 11건 + `playerState.ts:30`도 `z.enum(REPEAT_MODES)` 수렴. 롤링 하위호환(창 ① — 구 코드는 enum 컬럼을 문자열로 읽고 유효값만 씀, 구 클라이언트 upsert 1회 스테이징 검증 게이트) + 롤백 SQL + 별도 릴리스 권고 유지.
- **Phase 3 (측정 절차서 확정, 데이터 수집 대기)**: 운영자 절차서 완성 — Redis: SLOWLOG 임계 세션 조정(2ms/512, 측정 후 원복), **MONITOR는 60초 이하 창·운영 경고 명시**(공유 단일 인스턴스), payload 파서 스크립트(SET 분포·bytes 히스토그램). Postgres: pg_stat_statements 미로딩 확인(설치는 재시작 수반 — 유지보수 창), EXPLAIN 3종(① 대시보드 groupBy ② 프로필 groupBy ③ insert — 트랜잭션 랩핑+ROLLBACK). 착수 임계 제안: F-24 payload p95>100KB·SET>50회, F-25>150ms, F-27>1회/초·>50KB, F-28 부트>30s, F-29>50ms+SeqScan+10만행, F-30>2,000 guilds — 결과 기록 템플릿 포함. event-loop lag는 코드 계측 필요 — 별도 과제 명시. F-26·F-31 완료 확인.
- **F-15 (스테이징 체크리스트 확정)**: 현행 정책 실측 — 클라 identify 무한 5s 루프(`client.ts:50-117`), 봇 NoShards 무한 루프(`bootstrap.ts:40-57`, `SHARD_IDENTIFY_RETRY_MS` 기본 5s), health 서버는 부트 말미 바인드(`bootstrap.ts:211-236`, READY 전 503·유예 120s). **핵심 사실: docker-stack.yml bot은 restart_policy 미지정(스웜 기본 none) — unhealthy/exit 시 자동 재기동 없음**(S2/S3 정책 수렴 전제). 시나리오 S0-S6 확정(정상 할당, NoShards cap+알림, 503 관측·90s unhealthy 경계, rolling stop-first 유예 30s, 매니저 재시작 재식별, 롤백은 `beta-<sha>` 고정 태그). shardclient WS 프로토콜 변경 시 구·신 매니저 공존 검증 명시.
- **COR-9c (검증 완료, 갭 확정)**: plan 301행 '임시 캐시 의존' 실체 — `RoomInfo`가 프로세스 메모리 `Map<channelId, RoomInfo>` 전용(Redis/DB 키 0건; JTC 설정만 DB 영속). 불변식 "모든 추적 방은 멤버 또는 무장 타이머"의 **위반 실경로 1건**: 재클레임 이동 실패 시 `clearEmptyTimer`만 하고 무장 누락(`:189-190`). 갭 목록 — **P1**: ① fetch 오류를 채널 소멸로 오판하는 untrack(`:155-159` — `DiscordAPIError` 코드 판별 10003/50001로 한정), ② 위 재클레임 무장. **P2**: ① 소유자 없는 퇴장 후 재입장 시 소유권 재부여 부재(`:116·103-105` — 정상 가동 중 발생하는 COR-9c 본질 갭, 입장 처리에 승계 로직 재사용), ② 승계 overwrite API 실패 무음 처리(`:121-122` — ownerId 갱신 보류+재시도+Sentry), ③ 스냅샷 `.first()` 후계자 소멸(확인 후 ownerId 갱신). **P3**: READY reconcile 부재(Phase 2 계획 유지 — 이번 갭들 흡수), 길드 킥 정리, 봇만 남은 방 정책, `createRoomFromMarker` dead API, tempVoice 회귀 테스트 0.
- **F-13 (3종 분할 설계 확정, 구현 대기)**:
  - trackHandler(695행): pure core / IO shell — `pure/`{trackRef, restoreDecision, transitionDecision, watchdogDecision} + `state/transitionState` + `handlers/`{trackEvents(쌍둥이 DRY 감점 `:142-158 ≡ 187-203`), recovery, stateSync, notify} 모듈 맵 + 5컷 이동 순서(F-08 fix는 3컷에 착지, F-03 분은 4컷 흡수).
  - aiChatService(1,108행): 책임 9클러스터 실측(container 의존 60%가 채널 히스토리·기억 tidy 2개 집중, 오케스트레이터는 4지점 조합점) → `services/aiChat/` 9모듈(types/tokenText/llmClient/channelHistory/policy/turnControl/rollingSummary/memoryTidy/turnRunner) + 단방향 의존(**llmClient는 `aiTools/types.ts`만 import — index 순환 회피**) + 7컷 추출(컷 7에서 원본 소멸, 중간 재출력 잔류 금지 — F-12 컷 1 선례; 소비자 10파일 전수), 캐시 이원화 방지(선언은 move·잔재 금지), 순수 vitest 12항목 전략.
  - data-api routes(704행): 엔드포인트 **전수 24개 대장**(소비자까지 매칭) + 도메인 12파일 맵(common — 에러 매핑 3중 복제 통합/ops/playback/player[verbatim SSE]/botProfile/memberGreeting/guildSettings/images 4종), 인라인 zod 17개 실측. **소비자 0 후보 3개 판정**: `/v1/playback/recent`·`/v1/ohaasa/refresh`는 README 공개 API 문서화로 **존치**, `/v1/delivery/carriers`는 문서화·소비자 모두 없어 **이번 배치 삭제**(listCarriers·deliveryCarriersCacheKey 데드 export 동반 제거 — /track 별칭 해석은 resolveCarrierId·getCarriersCached 경로로 무영향). path-surface 스냅샷 테스트(URL·메서드·bodyLimit golden) 제안 + **F-17 경계 이중화 금지**(`/v1/player` 허브 safeParse 단일 유지) + `/dashboard`·metrics 라벨 문자열 보존. 컷 0~5 + utils 승격은 별도 컷.

## 남은 항목 (최신)

**2026-10-11 배치 — 완료(#41·#42 beta 머지)**: 랜딩 28K+ 복원(0abbc5c) / 플레이리스트 모바일 select 메뉴+길드 카드 버튼 크기 통일+토스트 정렬+프로필 운세 카드(702804b). **로그인 InvalidCheck pkce 인시던트 원인 확정**: docker-stack `env_file`은 stack deploy 시점 해석 — `service update --force`로는 env 미반영 → 옛 스펙(구 시크릿·구 URL)으로 떠 있었음. 재 stack deploy로 해결(코드 무죄 — 로컬 실체인 재현으로 검증). **다음**: 플레이리스트 import/export 1단계(JSON + 스포티파이 공개 플레이리스트 링크, 유저 OAuth 불필요 — data-api 클라이언트 크레덴셜 토큰, 트랙은 spotify URI 식별자 저장→라바링크 LavaSrc 해석) — 운영자: Spotify 앱 등록 + `SPOTIFY_CLIENT_ID/SECRET` env 필요. 2단계(비공개/좋아요 목록)는 계정 연결 필요로 수요 확인 후.

**2026-10-10 UI/출력 배치 — 완료(전부 beta 스쿼시 머지)**: #38 컨트롤러 UX(카드 진행바·다음 곡 목록 이미지화·5초 버킷 갱신·버튼 1행 재배치, d7030f6) / #39 오하아사 이미지→본문 순서(이미지엔 별자리·순위·아이템·열쇠·날짜만, 운세 설문·럭키 컬러는 복사 가능 본문으로 — 8f7f6c0 머지 180346e) / #40 플레이리스트 모바일 여백+디스코드 로그인 UX(4eb7148) / 랜딩 "이용 중인 서버 28K+" 카운트업 복원(이번 PR — 유저 지시로 R-17 예외). **후속 후보(조사만 함, 미구현)**: `/프로필` 이미지 성공 시 본문 부재, memberGreeting 인사 문구 이미지/본문 중복+텍스트가 이미지 위 렌더, nowplaying 카드·본문 제목/아티스트 부분 겹침. **이모지 12종 업로드는 여전히 운영자 작업 대기.**

**조사·설계는 전부 확정됨. 남은 것은 프로브/측정/스테이징 게이트와 구현 컷뿐:**

- **F-08+F-20 구현 컷** — 설계 확정(skipPendingUntil + decideRestore + TrackRef). 게이트 1건: 서버 TrackEnd `reason` 실측(/skip → WS 로그). 이후 5컷(pure/trackRef → restoreDecision → transitionDecision → watchdog/recovery → stateSync)으로 착수.
- **F-06 구현** — 운영 프로브(`redis-cli INFO server | grep redis_version` 또는 `GETDEL __probe:1`)로 ≥6.2/미만 확정 후 `claimCacheValue` 착수. redis 태그 고정은 이번 배치 완료(`redis:8-alpine` 메이저 고정 — 실측 버전은 창에서 재확인).
- **F-12 컷 3 구현** — skipFlow/playFlow 이전 설계·UX 패리티 체크리스트 9항목 확정. 실제 Discord 클릭 가능 세션 대기(정적 diff 대조 기준으로는 진행 가능, P7 allowedMentions 대조 필수).
- **Phase 3** — 절차서·임계·템플릿 확정: **측정 데이터 수집 전 착수 금지** 원칙 유지. 실측 기록 후 F-24~30 개별 판정.
- **F-15** — 스테이징 체크리스트 S0-S6 확정(restart_policy 미지정 사실 포함). 스테이징 배포 검증 시 실행.
- **F-13 구현 컷 3종** — trackHandler 5컷 / aiChat 7컷 / data-api routes 6컷, 전부 컷 단위 typecheck·lint·vitest green 유지. 데드 엔드포인트 3개 존치/삭제는 별개 판단.
- **F-18** — 마이그레이션 SQL(배치 A→D)·modes.ts 치환·롤백 계획 확정. 유지보수 창 + 별도 릴리스 + 스테이징 검증 게이트(구 클라이언트 upsert) 통과 후 착수.
- **F-21 구현 컷** — ConnState(journal 쌍둥이→RedisStore/NodeSession) 우선, Liveness는 스테이징 게이트, notifier는 F-08 세션 동행.
- **COR-9c 후속 소규모 컷** — P1 2건(fetch 오판 코드판별·재클레임 무장)은 즉시 적용 가능, P2 3건(재입장 소유권 재부여·승계 실패 관측·후계자 소멸 폴백)은 승계 로직 재사용. READY reconcile은 Phase 2 그대로.
- **소형 후속(이번 발견) — 완료**: changeNode 미catch 수정(bot), data-api 미문서화 `/v1/delivery/carriers` 제거(데드 export 동반), redis 플로팅 태그 고정(`redis:8-alpine`) · **잔여**: 컷 3 엣지 1건(`enqueueTrack→autoPlayRelated`) 수용 문서화만.
- **이모지 후속(유제 발견)**: ① API 폴백 fetcher 수정 완료 — `ClientApplication.fetch()`(`GET /oauth2/applications/@me`)는 이모지 컬렉션을 채우지 않음을 discord.js 소스로 확인, `client.application.emojis.fetch()`(매니저 fetch)로 교체. ② **미업로드 12종 확정**: `play`/`pause`/`stop` + 진행바 `pb_*` 9종 — PNG는 커밋(`a3423bc`)이나 `emoji-ids.json`은 87종(99 PNG 중). 로컬 머신에 DISCORD_TOKEN 없음(배포 env 주입 구조) → **운영자 작업 대기**: 토큰이 있는 곳에서 `yarn dlx tsx scripts/upload-emojis.ts`(기존 87종 skip·12종만 업로드) → 재생성된 매핑(canonical + apps/bot/resources) 커밋. 업로드는 즉시 유효, 매핑 반영은 재부팅(파일 로드)부터.
- **톰스톤 완료** — 커밋·머지 완료(#36 스쿼시 bdf5985; queueStore·playerSaver·pendingWriteSync+테스트 포함).
