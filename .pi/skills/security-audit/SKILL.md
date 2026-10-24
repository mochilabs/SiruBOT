---
name: security-audit
description: Evidence-driven security review of this monorepo - discovery, attack-path analysis, static exploitability verification, minimal-fix remediation.
---

# Security Audit

Edits only after explicit user approval; minimal fixes only.

## Rules

1. Every finding cites `path:line` with actual code; no guessed paths, names, CVE IDs.
2. Attacker perspective: entry -> validation -> sink; no path = not a finding.
3. Plausible != exploitable; a missing defense is not a vulnerability - classify per statuses below.
4. Static analysis only (see Safety rules).
5. Never print/quote/infer `.env`, tokens, keys, auth headers; redact credentials.
6. Include a "Checked and not vulnerable" section citing guarding code.
7. State what you did not verify; scope/limitations mandatory. Label claims verified/inference/hypothesis/unknown.

## Workflow

**Phase 0 - Scope:** note branch/commit (`git rev-parse --short HEAD`); confirm which apps/services exist in this checkout (some only on some branches); agree scope; default = trust-boundary sweep below.

**Phase 1 - Discovery:** inventory entries x sinks; record validation present (zod, type guard, allowlist, auth middleware) and whether it runs on the trusted side.
- Entries: Discord interactions/messages; HTTP routes (dashboard, data-api, shardmanager WS/API); Redis request/reply + pub/sub; DB content from user input; external responses (Lavalink/lyrics/YouTube); LLM output; user URLs; deploy config.
- Sinks: DB queries (incl. raw SQL/string-built Prisma); shell exec; eval; HTML/canvas rendering; outbound HTTP (SSRF); file paths; authz decisions; cache keys/cross-guild reads; secrets in logs; unbounded loops/queues (DoS).

**Phase 2 - Attack path:** numbered hops, each citing file:line:
`Entry (input + required privilege) -> hop (what happens / validation crossed) -> ... -> sink (file:line) -> Impact`.
Per hop: missing/late/incorrect validation; required privilege (any user / guild member / guild manager / bot admin / network position / none); boundary crossed. Unestablished hop = hypothesis, not finding.

**Phase 3 - Exploitability (static):** reachability in real configuration (not only with admin/misconfig); preconditions explicit (permissions, config, network position, timing, rate limits); re-check compensating controls (fail-closed auth, execution-time zod re-validation, per-guild cache isolation, escaped rendering); severity = CVSS 3.1 vector on realistic preconditions; runtime proof needed -> **propose a local test case**; never run it. Cross-check advisories (GHSA / `yarn npm audit` / OSV.dev -> NVD/CVE -> framework channels -> OWASP; match **installed lockfile versions**, not `package.json` ranges; confirm relevance to actual usage; never fabricate IDs); state known CVE/GHSA vs project-specific.

**Phase 4 - Remediation:** minimal fix first (validate at boundary, fix comparison, escape output, isolate cache key); design-level alternative if it's a bandage; rollout notes (migrations, old/new coexistence, fail-closed vs fail-open); regression tests naming the behavior in per-workspace Vitest; verify via `yarn lint`/`typecheck`/`test`. Applying fixes: feature branch (never `beta`/`main`), never weaken controls.

## Finding report — mandatory fields

- **ID** `SEC-001` (severity, then confidence) · **Title** concrete ("Guild cache key collision allows cross-guild reads", not "Possible cache issue") · **Severity** CVSS 3.1 vector + Critical/High/Medium/Low/Info · **Status** per categories below · **Component** app + module (`apps/bot/src/...`) · **Evidence** `path:line` + code excerpt · **Attack path** numbered hops (Phase 2 format) · **Preconditions** privileges/config/network · **Impact** CIA — concrete data/action affected · **Verification** static vs runtime vs not-run · **Remediation** minimal fix (+ alternative) · **Regression tests** specific cases · **References** advisory IDs/URLs or none.

Report order: summary table (ID, severity, status, component, title) -> findings -> checked-not-vulnerable -> false positives/ruled out -> scope/limitations -> remediation order.

## Severity

- **Critical:** low-privilege RCE, full auth bypass, secret disclosure, cross-guild data access.
- **High:** in-guild privilege escalation, stored XSS, SSRF with response access, constrained injection.
- **Medium:** missing authorization on sensitive action, IDOR with valid credentials, unamplified DoS, secrets in logs.
- **Low:** hardening gaps (timing-safe comparison, security headers), no demonstrated path.
- **Info:** hygiene, version notes without advisory match.

CVSS honestly reflects complexity/privileges - no inflation/deflation.

## Status categories

- **Exploitable** - verified attacker-controlled path, realistic preconditions.
- **Exploitability-limited** - real weakness blocked by a precondition; describe the limiter.
- **Defense-in-depth** - no path today, future change could open one; hardening, not a vuln.
- **Theoretical** - plausible class, no concrete path here; notes only.
- **Ruled out** - disproven by code; cite the guard (`path:line`), keep the entry.

Challenge each finding: "strongest reason this is NOT exploitable?" Resolve or downgrade; few confirmed beats many maybes.

## Safety rules

- Read-only by default (code, config, history; `git log/show`, `rg`, lockfile inspection, `yarn npm audit` fine).
- Never run: exploit code/PoCs (even locally), scanners/fuzzers/brute force, traffic replay, DoS/load tests, workspace-mutating installs/builds, DB migrations, anything writing to Redis/Postgres.
- Never touch production/shared environments; never act as the bot on Discord; never create external resources or push without instruction; no destructive "verification".
- Fixes needing execution: propose; user runs in dev. Writes require approval; stay scoped; state what changed.

## SiruBOT trust boundaries (re-verify against checkout)

- **data-api auth:** fails closed when `DATA_API_AUTH_KEY ?? AUTH_KEY` unset; raw key in `Authorization` (no Bearer); `/api/health` only unauthenticated route. Check fail-open, comparison timing, routes missing the guard, health-route leaks.
- **shardmanager WS:** `ShardClient.identify()` handshake must validate `AUTH_KEY`; check unauthenticated status/control endpoints, spoofable shard claims.
- **dashboard:** per-route server-side guild authorization (a disabled button is not authorization), CSRF/CORS, IDOR — guild A fetching guild B's data?
- **Cross-service Redis** (`packages/utils/src/redisChannels.ts`): pub/sub + request/reply payloads attacker-controlled if any writer is compromised - check consumer-side validation, channel isolation.
- **Guild isolation:** cache keys, player/queue state, DB queries per-guild; shared key or missing `guildId` filter = cross-tenant (Critical).
- **Custom commands:** specs zod-revalidated at execution time (not just save); dynamic content must not reach raw SQL, shell, unrestricted fetches.
- **LLM tools** (`services/aiTools/`): LLM output drives tool calls - untrusted; prompt injection must not reach privileged tools, cross-user memory, or unrestricted `web_fetch` (SSRF); user URLs need scheme/host allowlists, no internal endpoints.
- **Rendering/assets:** canvas/asset serving — path traversal in user filenames/keys, template injection, SSRF on remote image fetch.
- **Prisma:** `$queryRaw`/`$executeRaw` interpolation; unchecked `where` from user input (IDOR).
- **Secrets/telemetry:** `core/environment.ts`, `packages/utils/src/sentry.ts` - secrets in logs/Sentry breadcrumbs; CI: plaintext secrets, `pull_request_target`, PR title/branch script injection.
- **DoS:** unbounded caches/queues, ReDoS, unbounded LLM/tool loops, oversized Lavalink search input.

## Output standards

- English; identifiers, API names, quoted user-facing strings (often Korean here) stay verbatim. Tables for findings, short code excerpts; every claim carries `path:line` or advisory URL.
- End with **Scope and limitations**: snapshot commit, areas inspected, commands run, what remains unverified.
- Quality bar: a reviewer can follow the path hop by hop and implement fix + regression test unaided.