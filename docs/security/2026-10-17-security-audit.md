# Security Audit Report: SiruBOT monorepo

| | |
|---|---|
| **Snapshot** | branch `beta` @ `4231835b` (includes `apps/storage` + guild-assets feature) |
| **Date** | 2026-10-17 |
| **Method** | Read-only static analysis (source reads, `rg`/`grep`, `git`, `yarn npm audit --all`). No exploits, scanners, fuzzers, or runtime tests were executed; nothing in the codebase was modified. |
| **Scope** | Full sweep of trust boundaries: `apps/bot`, `apps/dashboard`, `apps/data-api`, `apps/shardmanager`, `apps/storage`, `packages/{prisma,shardclient,utils}`, CI workflows, Dockerfiles, dependency manifests. |

---

## Executive summary

The codebase is defensively well-built: service auth is fail-closed and timing-safe everywhere, the dashboard's guild authorization chain is live-verified and deny-by-default, there is no raw SQL anywhere, and the two hardest targets (LLM-driven `web_fetch` SSRF, storage path handling) have real, layered defenses. **No Critical or High issue was found.** The most valuable fixes are an access-guard bypass in the custom-command spec validator (the exact control the schema documents as role-theft prevention), a rate-limit bypass on the one public dashboard endpoint, and shard-allocation robustness in shardmanager.

| ID | Severity | Status | Component | Title |
|----|----------|--------|-----------|-------|
| SEC-001 | Medium (4.2) | Exploitability-limited | `packages/utils` + `apps/bot` custom commands | Nested `if` steps bypass the mandatory access guard on role actions |
| SEC-002 | Medium (5.3) | **Exploitable** | `apps/dashboard` public chart | Rate-limit bypass via spoofed `X-Forwarded-For` → unauthenticated DB load |
| SEC-003 | Medium (5.5) | Exploitability-limited | `apps/shardmanager` | Re-IDENTIFY leaks shard allocations; unbounded shard claims → fleet outage |
| SEC-004 | Medium (4.9) | Exploitability-limited | `apps/shardmanager` | WS `maxPayload` unconfigured (100 MiB frames) + no connection limits |
| SEC-005 | Low (3.5) | Exploitability-limited | `apps/data-api` play relay | Play relay accepts any URL scheme → fetch from Lavalink host network |
| SEC-006 | Low (3.9) | Exploitability-limited | Redis request/reply (bot ↔ data-api) | Request/reply messages carry no origin authentication |
| SEC-007 | Low (3.5) | Exploitability-limited | `apps/bot` audio views | Mention injection via attacker-controlled track titles |
| SEC-008 | Low (2.3) | Defense-in-depth | `packages/utils` Lavalink config | Malformed `LAVALINK_HOSTS` error echoes node password into logs |
| SEC-009 | Info (0.0) | Defense-in-depth | `.github/workflows` | `${{ github.ref_name }}` interpolated inside `run:` shell block |
| SEC-010 | Info (0.0) | Defense-in-depth | `apps/data-api`, `apps/shardmanager` auth | `startsWith('/api/health')` auth exclusion is prefix-based |

---

## Detailed findings

### SEC-001: Nested `if` steps bypass the mandatory access guard on role actions

| Field | Content |
|---|---|
| Severity | CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:L/A:N — **Medium (4.2)** |
| Status | Exploitability-limited (a guild admin must save the spec; AI-drafted specs are a realistic source) |
| Component | `packages/utils/src/customCommand.ts` (validator), `apps/bot/src/services/customCommands/interpreter.ts` (executor) |
| References | none (project-specific logic) |

**Evidence.** The schema documents the guard: *"역할 변경 액션은 실행 제한 필수 — 아무나 실행하면 역할 탈취 수단이 돼요"*. The check only inspects **top-level** steps:

```ts
// packages/utils/src/customCommand.ts:242
const hasRoleAction = spec.steps.some((step) => step.type === 'add_role' || step.type === 'remove_role');
if (hasRoleAction && (spec.access === undefined || spec.access.mode === 'everyone')) { ... }
```

Yet role steps are explicitly allowed inside `if` branches (`nonIfStepSchema`, `packages/utils/src/customCommand.ts:161-169`), and the recursive walker exists but is used only for the other two checks (`walkSteps`, `customCommand.ts:207-215`, applied at `:227`, `:249`). At execution, a missing `access` grants everyone (`interpreter.ts:116-117` — `if (!access || access.mode === 'everyone') return null;`) and the branch runs `ctx.member.addRole(...)` / `removeRole(...)` (`interpreter.ts:252-269` → `:200-209`).

**Attack path.**

1. Entry: a guild admin saves (or accepts an AI draft of — `apps/data-api/src/routes/customCommandDraft.ts:116-137` output flows through the same schema) a v2 spec: `steps: [{ type: 'if', condition: { kind: 'arg_matches', index: 0, value: 'x' }, then: [{ type: 'add_role', roleId: '<privileged role>' }] }]`, with no `access` block.
2. Hop 1: `customCommandSpecSchemaV2` validation **passes** — `spec.steps.some(...)` is `false` (`customCommand.ts:242`).
3. Hop 2: any member triggers the command (prefix listener `customCommandPrefix.ts:106` or slash `customCommandSlash.ts:78`) → `runCustomCommandSpec` revalidates the same flawed schema (`interpreter.ts:275-277`) and `checkAccess(undefined)` returns `null` (`interpreter.ts:279-281`).
4. Hop 3: attacker passes the trivial condition (`arg_matches` = supply argument Y; `channel_match` = post in channel X) → `runSteps(step.then)` executes `add_role` (`interpreter.ts:252-269`).
5. Sink: `ctx.member.addRole(step.roleId)` (`interpreter.ts:200-209`).

**Preconditions:** guild admin saves the shaped spec (the write path validates with the same flawed schema — `apps/dashboard/src/app/api/servers/[id]/custom-commands/route.ts:55-59`); attacker is any guild member.

**Impact:** Guild role escalation (Integrity) — self-assignment of any unmanaged role below the bot's top role (DJ/subscription/role-gated-channel roles). Bounded by `checkRoleAction` (`interpreter.ts:128-135`) and roles affect only the invoking member.

**Verification.** Verified by reading the schema, validator, and executor (cited lines). Not run: a live save/execute cycle — proposed local test below covers it. The existing test suite only exercises top-level role steps (`packages/utils/src/customCommand.test.ts:82-102`), so the gap is untested.

**Remediation (minimal fix).** Use the existing recursive walker for the role-action check:

```ts
// packages/utils/src/customCommand.ts:242
let hasRoleAction = false;
walkSteps(spec.steps, (step) => {
	if (step.type === 'add_role' || step.type === 'remove_role') hasRoleAction = true;
});
```

Design-level alternative: make `checkAccess` deny-by-default whenever *any* reachable step (nested included) mutates roles and `access` is absent — enforcement at execution time too, not only save time.

**Regression tests** (`packages/utils`, Vitest):

- rejects a spec with `add_role` nested in `if.then`/`if.else` and no `access`
- rejects the same with `access.mode === 'everyone'`
- accepts it when `access.mode === 'roles'` with a non-empty `roleIds`
- mirror case for `remove_role`

---

### SEC-002: Rate-limit bypass via spoofed `X-Forwarded-For` on public `GET /api/tracks`

| Field | Content |
|---|---|
| Severity | CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L — **Medium (5.3)** |
| Status | **Exploitable** (unauthenticated) |
| Component | `apps/dashboard/src/app/api/tracks/route.ts` |
| References | OWASP ASVS 11.1 (anti-automation) |

**Evidence.**

```ts
// apps/dashboard/src/app/api/tracks/route.ts:22-26
const session = await auth();
const subject =
  session?.user?.id ??
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  "anonymous";
```

**Attack path.**

1. Entry: unauthenticated `GET /api/tracks?query=…` with a client-chosen `X-Forwarded-For` header.
2. Hop 1: the **leftmost** XFF entry is taken as the rate-limit subject (`tracks/route.ts:23-26`). Even behind a reverse proxy that *appends* the real client IP (`X-Forwarded-For: fake, realIP`), `split(",")[0]` yields the attacker's `fake`.
3. Hop 2: each distinct spoofed value creates a fresh 30/min bucket (`guardRateLimit(rateKey("tracks-get", subject), READ_RATE)` — `tracks/route.ts:28-31`), so the intended cap never binds.
4. Sink: three Postgres queries per request (`db.track.findMany` + `count` + `aggregate`, `tracks/route.ts:60-76`).
5. Impact: unlimited anonymous database load (Availability). No data exposure — the endpoint is public by design (`tracks/route.ts:20-22`).

**Preconditions:** ability to send/append an `X-Forwarded-For` header — true for any direct or standard-proxy path.

**Verification.** Verified from source (cited lines). Not verified at runtime: the actual deployment proxy topology (whether a proxy overwrites vs. appends XFF) — the code is bypassable in the common "append" configuration regardless.

**Remediation (minimal fix).** Key on the socket-verified client IP (`x-real-ip` as set by *your* proxy, or the platform's rightmost-trusted forwarded entry), and never trust a client-supplied leftmost XFF entry. If no trusted source is available, fall back to a fixed `anonymous` bucket (one shared 30/min cap) rather than per-spoof buckets. Design-level: require auth for the key.

**Regression tests** (`apps/dashboard`, Vitest):

- two requests with different client-supplied `X-Forwarded-For` values share one rate-limit bucket
- the rate-limit subject equals the proxy-verified client IP, not the leftmost XFF entry

---

### SEC-003: Shardmanager re-IDENTIFY leaks allocations and allows unbounded shard claims

| Field | Content |
|---|---|
| Severity | CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:N/I:L/A:H — **Medium (5.5)** |
| Status | Exploitability-limited (requires the shared `AUTH_KEY`) |
| Component | `apps/shardmanager/src/routes/ws`, `apps/shardmanager/src/core/shardRegistry.ts` |

**Evidence.**

- Re-IDENTIFY has no "already identified" guard (`apps/shardmanager/src/routes/ws/index.ts:55`, `:90`).
- Claimed ids are force-allocated with no bounds/ownership check: `registry.forceAllocate(shardId)` (`routes/ws/index.ts:105-110`) → `public forceAllocate(shardId: number): void { this.allocatedShards.add(shardId); }` (`core/shardRegistry.ts:69-71`).
- The schema accepts any numbers: `shardIds: z.array(z.number())` (`packages/shardclient/src/ws-types/index.ts:68`) — floats, negatives, out-of-range ids pass.
- `registry.register` overwrites the socket's entry (`core/shardRegistry.ts:76-78`) while `release()` frees only the latest id set on disconnect (`core/shardRegistry.ts:103-110`) → previously claimed ids are **permanently leaked** from `allocatedShards`.

**Attack path.**

1. Entry: any client holding `AUTH_KEY` (shared by all bot processes, the dashboard, data-api, and storage) opens a WS connection (auth at upgrade — verified safe, see ruled-out list) and sends `IDENTIFY`.
2. Hop 1: repeated `IDENTIFY` with `shardIds: [0..n]` leaks each prior claim (`routes/ws/index.ts:105-125` + `shardRegistry.ts:103-110`).
3. Hop 2: once `shardCount` ids are leaked, `allocateShardIds()` returns `null` for every new bot (`core/shardRegistry.ts:41-53`) → `IDENTIFY_ACK { shardIds: [] }` + close `4000` (`routes/ws/index.ts:114-121`) and the bot loops forever (`apps/bot/src/core/bootstrap.ts:47-57`).
4. Sinks/impact: **permanent shard-allocation outage until manager restart** (Availability: High) and shard theft — a second client claiming an id already held by a live process produces duplicate gateway sessions and corrupt `/api/shards` reporting (Integrity: Low).

**Preconditions:** possession of the shared `AUTH_KEY` (compromise of any one service holding it, or a malicious/buggy bot build). Not reachable unauthenticated — verified: WS upgrades traverse the full Fastify lifecycle including the auth hook (`node_modules/@fastify/websocket/index.js:112-120`, hook at `apps/shardmanager/src/plugins/auth.ts:26-34`), and IDENTIFY double-checks the key in the payload (`routes/ws/index.ts:94-98`).

**Verification.** All hops verified in source (cited). The allocation leak is a logic consequence of `register`/`release` as written; a runtime exercise was deliberately not run.

**Remediation (minimal fix).** In `handleIdentify`: (a) reject a second `IDENTIFY` on an already-registered socket; (b) validate `payload.shardIds` — integers within `[0, shardCount)`, unique, and not held by another live entry (or only by an entry whose socket is closed). Longer-term design fix: per-process credentials instead of one shared key, and make `release()` free only ids not claimed by another live entry (also fixes the reconnect race, see notes).

**Regression tests** (`apps/shardmanager`, Vitest on `shardRegistry` + `handleIdentify`):

- second IDENTIFY on the same socket is rejected and leaks no allocation
- IDENTIFY with `shardIds: [3.5]` / `[-1]` / `[shardCount]` is rejected
- claiming a shard id held by a live process is refused
- after a rejected re-identify, `allocateShardIds()` still returns free ids

---

### SEC-004: Shardmanager WS `maxPayload` unconfigured; no connection limits

| Field | Content |
|---|---|
| Severity | CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:N/I:N/A:H — **Medium (4.9)** |
| Status | Exploitability-limited (requires `AUTH_KEY`) |
| Component | `apps/shardmanager/src/server.ts`, `routes/ws` |

**Evidence.** `await this.fastify.register(WebSocket);` with no options (`apps/shardmanager/src/server.ts:44`) → `ws` default `maxPayload` is 100 MiB per frame; each message is `JSON.parse`d then zod-parsed (`routes/ws/index.ts:45-46`). No connection cap, no message rate limit, and heartbeat reaping covers only *identified* processes (`core/shardRegistry.ts:243-260`) — a socket that connects and never IDENTIFYs is never reaped.

**Attack path.** Authenticated client → repeated ~100 MiB frames → memory/CPU exhaustion of the shardmanager → shard allocation/health for the whole bot fleet fails (Availability). Unauthenticated abuse is limited to connection churn (401 at upgrade, no state created).

**Remediation.** `fastify.register(WebSocket, { options: { maxPayload: 64 * 1024 } })` (messages are small JSON), cap concurrent connections per key/IP, and reap unidentified sockets after a timeout.

**Regression tests:** assertion that the registered WS server has `maxPayload` set and that an unidentified socket is closed after the reap timeout.

---

### SEC-005: Play relay accepts arbitrary URL schemes → fetch from Lavalink host network

| Field | Content |
|---|---|
| Severity | CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:C/C:L/I:N/A:N — **Low (3.5)** |
| Status | Exploitability-limited (service key + guild-member session + bot-side voice/DJ checks) |
| Component | `apps/data-api` (`/v1/internal/player/play`); sink in bot/Lavalink (inference) |

**Evidence.** `uri: z.string().url().max(500)` (`apps/data-api/src/routes/index.ts:715-719`) — zod `.url()` accepts `file:`, `data:`, `ftp:`, `http://169.254.169.254/...`. The value is published verbatim to Redis for the bot (`apps/data-api/src/services/playerWebHub.ts:174-181`), which resolves it via Lavalink `loadtracks` — Lavalink may fetch the URL from its host network *(inference; the Lavalink-side fetch was not verified in this snapshot)*.

**Attack path.**

1. Member-authenticated dashboard `POST /api/servers/[id]/player/play` (`apps/dashboard/src/app/api/servers/[id]/player/play/route.ts:13-30`) with an attacker-chosen `uri`.
2. data-api schema accepts any scheme (`routes/index.ts:715-719`).
3. Redis relay (`playerWebHub.ts:174-181`).
4. Bot forwards to Lavalink → fetch from the Lavalink host's network position (SSRF-class). Response content is not directly returned to the attacker (track metadata leaks only partially), hence Low.

**Preconditions:** shared service key held by data-api/dashboard path; attacker is a guild member; bot validates voice/DJ state.

**Remediation (minimal fix).** Restrict at the contract layer: `uri: z.string().max(500).regex(/^https?:\/\//)` in `playerWebPlaySchema` — and mirror in `packages/utils/src/playerWeb.ts`'s request schema so the bot re-validates at execution time.

**Regression tests** (`apps/data-api`): "playerWebPlaySchema rejects `file://`, `data:`, and bare-host URIs; accepts `https://`".

---

### SEC-006: Redis request/reply messages carry no origin authentication

| Field | Content |
|---|---|
| Severity | CVSS:3.1/AV:A/AC:H/PR:H/UI:N/S:U/C:L/I:L/A:L — **Low (3.9)** |
| Status | Exploitability-limited (requires Redis pub/sub write access — internal trust boundary) |
| Component | `apps/data-api` hubs ↔ `apps/bot` responders (`packages/utils/src/redisChannels.ts`) |

**Evidence.** Requests carry only a `crypto.randomUUID()` requestId (`apps/data-api/src/services/guildDataHub.ts:167`); responses are correlated on `requestId`+`guildId`+`kind` (`guildDataHub.ts:103-118`) but nothing authenticates the *publisher*. A Redis-capable attacker can forge a `player-web:request` carrying an admin's `userId` (the bot trusts payload `userId`, verified against live member state at `apps/bot/src/services/playerWebResponder.ts:395-423` — a *real* admin id passes), or answer a request by observing the REQUEST channel. Consumer-side schema validation is real everywhere (see checked list), so this is purely an origin problem.

**Impact.** Playback control / guild-data disclosure / greeting-test sends as any real user (C/I/L). Preconditions make it largely moot: Redis holds Lavalink sessions and queues, so its compromise is already severe.

**Remediation (design).** HMAC (per-service key) over request payloads, or move request/reply onto a Redis stream with a server-side publisher allowlist. Minimal: keep Redis bound to localhost/internal network + `requirepass`/ACL and document it as a hard trust boundary.

**Regression tests:** round-trip test that a response with a valid `requestId` but an invalid HMAC is dropped.

---

### SEC-007: Mention injection via attacker-controlled track titles

| Field | Content |
|---|---|
| Severity | CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:U/C:N/I:L/A:N — **Low (3.5)** |
| Status | Exploitability-limited (notification spam only) |
| Component | `apps/bot/src/modules/audio/view/{queue,controller,nowplaying}.ts` |

**Evidence.** Track titles flow unsanitized into Components V2 text (`view/queue.ts:134,140`, `view/controller.ts:72`, `view/nowplaying.ts:14`), and the sending commands set **no** `allowedMentions` (verified: zero `allowedMentions` matches in the view files and `commands/queue.ts` / `commands/nowplaying.ts`), unlike `playerNotifier` (`lavalink/player/playerNotifier.ts:109,130,204` sets `{ roles: [], users: [] }`) and the custom-command path (`interpreter.ts:37,189,192`).

**Attack path.** Queue a track whose title embeds `<@USER_ID>`/`<@&ROLE_ID>` markup → queue/nowplaying/controller views render → mentions resolve and ping. Impact: targeted notification spam. (`@everyone` additionally requires the bot's Mention Everyone permission.)

**Remediation.** Add `allowedMentions: { parse: [], roles: [], users: [] }` to these send sites (match the `playerNotifier` pattern), or sanitize titles before interpolation.

**Regression tests** (`apps/bot`): rendering the queue view with a title containing `<@123>` produces a message with `allowedMentions` disabling user/role pings.

---

### SEC-008: Malformed `LAVALINK_HOSTS` error echoes the raw entry (password) into logs

| Field | Content |
|---|---|
| Severity | CVSS:3.1/AV:L/AC:L/PR:H/UI:N/S:U/C:L/I:N/A:N — **Low (2.3)** |
| Status | Defense-in-depth |
| Component | `packages/utils/src/lavalinkHosts.ts` |

**Evidence.** `throw new Error('Invalid LAVALINK_HOSTS format at index ${index}: "${entry}" ...')` (`packages/utils/src/lavalinkHosts.ts:30,34`) — `entry` has the form `id_host_port[_password]`, so a typo (e.g. empty id/host) embeds the node password in the message, which `apps/bot/src/core/bootstrap.ts` logs in full before exiting. Unhandled-rejection Sentry handlers carry unscrubbed errors generally (`apps/bot/src/core/environment.ts:11-27`; no `beforeSend` scrubber in `packages/utils/src/sentry.ts`).

**Remediation.** Report only the entry index (and maybe `id`), never the raw entry — the "Invalid port" message at `:38` already does this. Add a Sentry `beforeSend` scrubber as hardening.

**Regression tests** (`packages/utils`): "parseLavalinkHosts error message contains no password fragment of the offending entry".

---

### SEC-009: `${{ github.ref_name }}` interpolated inside a `run:` shell block (Info)

`REF_NAME="${{ github.ref_name }}"` (`.github/workflows/docker-beta.yml:99`). Git ref names may contain `"` `$()` `;`, making this a genuine command-injection primitive in shell context. **Defense-in-depth only:** the workflow runs on `push` to `beta`/`feat/**`, i.e. only for users who can already edit the workflow on their own ref, and the job holds `contents: read` + `GITHUB_TOKEN` only — no privilege gain. Fix via `env:` indirection (never `${{ }}` inside `run:`). Same class: `lint.yml` lacks a `permissions:` block (runs PR code with default token — `pull_request`, no secrets, so low risk); `node:22-slim` base images unpinned to digest.

### SEC-010: Prefix-based auth exclusion for `/api/health` (Info)

Both gateways exclude with `request.url.startsWith('/api/health')` (`apps/data-api/src/plugins/auth.ts:8,25`; `apps/shardmanager/src/plugins/auth.ts:6,27`); the data-api test suite even enshrines prefix behavior (`apps/data-api/src/plugins/auth.test.ts:54-61`). A future route under `/api/health*` would be silently unauthenticated. Not exploitable today (no such route exists; path confusion into protected routes is not possible). Fix: exact-path comparison.

---

## Checked and not vulnerable (guarding code)

- **Storage service auth & paths** — fail-closed boot on missing key (`apps/storage/src/config/env.ts:26-29`), `timingSafeEqual` compare (`apps/storage/src/plugins/auth.ts:10-19`), segment allowlist + containment check defeating path traversal (`apps/storage/src/services/objectStore.ts:32-47`), magic-byte MIME sniff + extension match (`apps/storage/src/routes/objects.ts:36-42`), `nosniff` on public GET (`objects.ts:74`). Public GET is unauthenticated **by design** (Discord embed fetch) with unguessable `guildId/uuid.ext` keys (`packages/utils/src/storage.ts:44-52`, `apps/dashboard/src/app/api/servers/[id]/assets/route.ts:96`).
- **Dashboard guild authorization & IDOR** — every `/api/servers/[id]/*` handler calls `authorizeGuildManage`/`Member` first (`apps/dashboard/src/lib/api-guards.ts:18-56`); live Discord `/users/@me/guilds` permission-bit check, deny-by-default, Discord outage → **502 deny** (`guild-permissions.ts:151-190`); all 43 route files surveyed — user-owned rows scoped `where {id, userId}`, guild rows `where {id: cmdId, guildId: id}` (e.g. `custom-commands/[cmdId]/route.ts:41-43,114-116`). Guild A cannot access guild B's data. Admin telemetry (`/api/shards`, `/api/data-api`) behind a fail-closed allowlist (`lib/admin-ids.ts:27-30`).
- **CSRF posture** — no `middleware.ts`, but all state-changing routes are POST/PUT/PATCH/DELETE (no GET side effects) and the session cookie is `SameSite=Lax`, so cross-site non-GET carries no cookie. Residual risk only for legacy SameSite-broken clients (see notes).
- **Service auth (data-api, shardmanager, storage)** — all three fail closed at boot (`apps/data-api/src/plugins/auth.ts:19-22`, shardmanager `auth.ts:19-22`, storage `config/env.ts:26-29`), all use SHA-256 + `timingSafeEqual` (`data-api auth.ts:11-15`), and the data-api guard is a single root hook installed before route registration covering all 33 non-health routes (`server.ts:57-60`).
- **SQL injection** — zero `$queryRaw`/`$executeRaw`/`Prisma.sql`/raw-driver usage in source repo-wide (only generated `packages/prisma/dist` type declarations mention them); all Prisma access is typed.
- **LLM output** — zod revalidated before use (`apps/data-api/src/routes/customCommandDraft.ts:116-137`), never drives tools/fetches; LLM base URL is env-only (`providers/translate.ts:78-92`); bot AI tool identity comes from the Discord event, not the model (`aiChatService.ts:1060`), memory tools are user-scoped (`aiTools/memory.ts:30,51`), tool rounds capped at 5.
- **`web_fetch` SSRF** — scheme allowlist, private-range rejection incl. mapped-IPv6/NAT64, all DNS answers validated, connect-time re-resolution pinning the connection (defeats DNS rebinding), redirect re-check, content-type allowlist, 400 KB cap (`apps/bot/src/services/aiTools/webFetch.ts:89-155,207`).
- **Custom-command execution** — spec zod-revalidated on **every** execution (`interpreter.ts:275-277`); action surface is Discord API calls only; `{argv}` substitution strips mention markup (`interpreter.ts:95-105`) and all sends use `allowedMentions: { parse: [] }`; role actions affect the invoker only and are hierarchy-checked (`interpreter.ts:128-135,200-209`); specs are dashboard-admin-writable only.
- **`eval` command** — `OwnerOnly` precondition (`commands/development/eval.ts:17`) + independent `OWNERS` re-check in the modal handler (`evalModal.ts:20-23`); all modal customIds are static literals.
- **Canvas rendering (data-api)** — remote image fetches go through a 5-host allowlist (`renderers/canvasUtils.ts:62-78`); uploads are data-URI→buffer (no fetch); no user input touches `fs`/`path`; no `eval`/`Function`/`child_process` in `src/`.
- **Redis consumers (both sides)** — every payload zod/type-validated, channel-vs-payload `guildId` match enforced (`apps/data-api/src/services/playerHub.ts:65-76`, `guildDataHub.ts:88-118`; bot responders re-verify live Discord state before acting — `playerWebResponder.ts:395-423`); channel names are fixed constants (`packages/utils/src/redisChannels.ts`).
- **Secrets** — `accessToken` never enters the client-visible session (`apps/dashboard/src/lib/auth.ts:89-93`); tokens AES-256-GCM at rest (`lib/token-store.ts:61-87`); no server secrets in client bundles (`NEXT_PUBLIC_*` limited to public values); error responses use fixed messages; no `pull_request_target`, plaintext secrets, or `curl|bash` in CI.

## False positives / ruled out candidates

- **Cross-guild asset access via storage public GET** — ruled out: keys embed the owner guild + `crypto.randomUUID()` (`assets/route.ts:96`); objects are public-by-design capability URLs; `list` is auth-gated (`objects.ts:81-83`).
- **Open redirect via `callbackUrl`** — ruled out: page-side relative-path check (`login/page.tsx:26-32`) plus Auth.js's default `redirect` callback constraining to same-origin (`@auth/core/lib/init.js:14-19`). Keep page-side validation on the `signIn` branch too (hardening).
- **XSS via asset URLs** — ruled out: URLs are server-generated from `STORAGE_PUBLIC_URL`; no `dangerouslySetInnerHTML` in dashboard source.
- **Cache-key collisions (guild/perm/rate keys)** — ruled out: components are Discord snowflakes matched exactly (`guild-permissions.ts:172`); data-api provider caches are keyed by non-ambiguous provider input with a 50k cardinality cap (`utils/cache.ts:8-9`).
- **Prisma ownership TOCTOU (check-then-act `update({ where: { id } })`)** — no ownership-transfer path exists; defense-in-depth recommendation only (`updateMany({ where: { id, userId } })`).
- **`Track` cascade delete would erase cross-tenant history** — dormant: no code path deletes `Track` rows.
- **Custom-command spec referencing another guild's public asset URL** — grants nothing beyond the public capability URL (Theoretical).
- **data-api `/api/health` Redis boolean** — negligible disclosure (by design).
- **`figlet` 1.11.0 DoS advisory (GHSA-62ch-8vmq-8xm7)** — only call site passes a fixed string (`clientReady.ts:112`); vulnerable path unreachable.

## Informational: dependencies (`yarn npm audit --all`, resolved against `yarn.lock`)

- **`undici` 7.26.0** (direct dep of bot/data-api/shardmanager/utils): 21 advisories, all fixed in **7.29.1** (incl. [GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3), [GHSA-vmh5-mc38-953g](https://github.com/advisories/GHSA-vmh5-mc38-953g), [GHSA-4cwx-7wf7-3272](https://github.com/advisories/GHSA-4cwx-7wf7-3272)). Current code uses only `fetch`, `Agent`+`buildConnector` (`apps/bot/src/services/aiTools/webFetch.ts:3`), and `fetch` (`apps/shardmanager/src/utils/gateway.ts:1`, `packages/utils/src/youtube.ts:1`) — none of the vulnerable `ProxyAgent`/`BalancedPool`/`WebSocketStream`/cache-interceptor classes — so the high-severity items are **not reachable via current usage** (verified). Still upgrade: future use of those classes would silently inherit the risk. `undici` 6.29.0 (transitive) also in-tree.
- **`figlet` 1.11.0** — [GHSA-62ch-8vmq-8xm7](https://github.com/advisories/GHSA-62ch-8vmq-8xm7) (High, DoS): not reachable (see above); upgrade opportunistically.
- No advisories matched `next` 16.4.0, `next-auth` 5.0.0-beta.32 (beta in production — worth monitoring), `fastify` 5.12.7, `discord.js` 14.27.0, `@sapphire/*`, `prisma` 7.8.0, `zod`, `ws`, `node-fetch` 2.7.0, `tar` 6.x, `glob` 7.x, `skia-canvas` 3.0.8, `sharp` 0.35.5 in this audit run.

## Additional defense-in-depth notes

- **Rate limiter fail-open on Redis errors** (`apps/dashboard/src/lib/rate-limit.ts:104-113`) and per-process in-memory fallback without `REDIS_URL` — limit multiplies by instance count in multi-instance deployments.
- **Several authenticated read endpoints have no rate limit** (`playlists/[id]` GET, `favorites` GET, `settings` GET, `custom-commands` GET, `greeting` GET, `ai` GET, `player` GET, `servers` GET); data-api has no rate limiting at all (bounded instead by dedup/circuit breaker/cache caps/pending caps).
- **Guild-permission results cached 60 s** (memory + Redis, `guild-permissions.ts:27`) — a demoted admin retains access briefly.
- **AI chat channel context** injects recent messages from other users into the prompt (`aiChatService.ts:409-428`) — prompt injection can poison the *invoking* user's own memory via `memory_save`; no cross-user effect (inherent to LLM context; mitigated by per-user isolation and `memory_forget`).
- **Unrestricted `loadImage()` export** in `apps/data-api/src/renderers/canvasUtils.ts:49-59` is an SSRF footgun (no current caller bypasses the allowlisted wrapper); consider un-exporting.
- **Shardmanager reconnect race** — `release()` can free ids under a live reconnected owner (`shardRegistry.ts:103-110`); fixed by the same change as SEC-003.
- **`guildId` zod patterns** accept free charset (`min(1).max(32)` in places) — tighten to snowflake `/^\d{1,20}$/`.
- **Prompt injection into custom-command drafts** (`/v1/ai/custom-command-draft`) can shape draft content, but a guild admin must accept it and the bot re-validates at execution — social-engineering residual only.
- **DJ gate allows all when no DJ role is configured** (`services/guildService.ts:117-121`) — documented design; be aware for unconfigured guilds.

## Prioritized remediation order

1. **SEC-001** — one-line validator fix (`walkSteps` for `hasRoleAction`) + 4 regression tests; afterwards re-audit existing saved specs for nested-if role actions.
2. **SEC-002** — stop trusting client XFF for the rate-limit subject on `/api/tracks`.
3. **SEC-003** — reject duplicate IDENTIFY + validate shard ids (integer, in-range, unclaimed).
4. **SEC-004** — `maxPayload` + connection caps + reap unidentified sockets.
5. **SEC-005** — `^https?://` restriction on the play `uri` in data-api **and** `packages/utils/src/playerWeb.ts`.
6. **SEC-007** — `allowedMentions` on the three audio view send paths (cheap).
7. **SEC-008** — redact `LAVALINK_HOSTS` entries in errors; add Sentry `beforeSend` scrubber.
8. **SEC-009 / SEC-010** — workflow `env:` indirection + `permissions:` blocks; exact-path health exclusions.
9. **SEC-006** — HMAC'd Redis payloads (design change; schedule alongside a Redis ACL/network review).

Verification commands (run locally; **not** run during this audit): `yarn lint`, `yarn typecheck`, `yarn test` (Vitest per workspace).

---

## Scope and limitations

- **Snapshot:** `beta` @ `4231835b`. Findings describe exactly this commit.
- **Inspected (directly or via delegated read-only review, evidence re-verified for every reported finding):** `apps/storage` (all), `apps/dashboard` (API routes, auth/permission/rate-limit/storage libs, client asset components), `apps/data-api` (routes, auth, renderers, providers, Redis hubs), `apps/bot` (custom commands, AI tools/chat, audio views, preconditions, listeners), `apps/shardmanager` + `packages/shardclient`, `packages/utils`, `packages/prisma` schema + migrations, `.github/workflows`, root `Dockerfile`, `docker/*compose*`.
- **Commands actually run:** `git rev-parse`/branch checks, `grep`/`rg`/`sed`/`cat` reads, `yarn npm audit --all` (read-only network), reads of `node_modules/@fastify/websocket` and `@auth/core` internals for two framework-behavior questions.
- **Deliberately not run:** any exploit/PoC/fuzzer/scanner, runtime or load tests, `yarn install`/build/generate, migrations, or any traffic to live services. Runtime confirmation is outstanding for: SEC-002 behavior behind the real proxy topology, SEC-003's allocation-leak end state (proposed as local tests only), and the Lavalink-side fetch behavior in SEC-005 (sink outside the verified code, marked inference).
- **Not covered:** full advisory-status verification for every transitive dependency (only the `yarn npm audit` output and usage-applicability of `undici`/`figlet` were checked); `dist/`/`.next` build artifacts; deployment secret handling outside the repo (`.env` values were never read); browser-side XSS beyond static review.

Every finding cites code inspected at the given `path:line`; inferred claims are labeled as such in the finding. No fixes were applied with this report.
