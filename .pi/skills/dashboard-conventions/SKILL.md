---
name: dashboard-conventions
description: apps/dashboard (Next.js 16 App Router) conventions — SWR/fetcher, zustand, zod-validated API routes, next-auth, security rules; load before touching dashboard pages, API routes, hooks, or stores.
---

# Dashboard Conventions (apps/dashboard)

- Next.js **16** App Router, React 19, TS, Tailwind v4. UI strings Korean. Server data → SWR, UI state → zustand, session → next-auth.
- UI components and design tokens follow the `dashboard-ui` skill. Imports use `@/` alias.

## SWR — src/lib/swr.ts

- Never raw `useSWR` for authed data; use `src/lib/swr.ts` hooks:
  - `useAuthedSWR<T>(key, callbackUrl)` — key `null` until `useSession()` is `authenticated`; login redirect on `unauthenticated`.
  - `useGuildResource<T>(guildId, path, { fetcher, enabled?, refreshInterval? })` — reads `/api/servers/:id<path>` with an `ApiError` fetcher; 401 → redirect to `/servers/:id`; `enabled: false` closes the key; `refreshInterval` only for polling; derive write URLs from `guildUrl` (the SWR key).
  - `createApiFetcher<T>(fallbackMessage, { sessionRetry? })` — JSON GET fetcher throwing `ApiError` (`@/lib/api-error`) with the server `{ error }`; `sessionRetry` = one session-cookie refresh on 401.
- SWRConfig (`src/components/Providers.tsx`): `revalidateOnFocus: false, dedupingInterval: 5000, errorRetryCount: 3`. Single `<Toaster />` there — no per-page toasters. Feedback: `toast.success/error/info/warning` (`@/components/ui/toast`).
- Mutations: `fetch` + `res.ok` + toast. Optimistic: `mutate(newData, { revalidate: false })` → server call → `await mutate()` (`src/hooks/use-playlists.ts`).
- Server Components needing data: `await fetch(..., { cache: "no-store" })`.

## Client state — zustand (src/store/)

- File `use-<name>-store.ts`, hook `use<Name>Store` (`use-ui-store.ts`, `use-search-store.ts`). NEVER store server data in zustand (SWR territory); UI flags/focus/menu state only.

## API Routes (src/app/api/**/route.ts)

Every route, in order:
1. Guild gate (`@/lib/api-guards`): `authorizeGuildManage(id)`/`authorizeGuildMember(id)` → `{ ok, token, userId } | { ok: false, status: 401|403|502 }`; on failure return `deniedGuildManage(authz)`/`deniedGuildMember(authz)` — never call `auth()`/`canManage()` directly. Manage gate checks guild management permission only (DJ/control is the bot's call); `502` = Discord unreachable, not a disguised 403.
2. Rate limit: `guardRateLimit(rateKey(name, authz.userId, guildId), RULE)` (`@/lib/rate-limit`), return the 429 response if limited. `WRITE_RATE` 12/min, `READ_RATE` 30/min, `HEAVY_WRITE_RATE` 5/min, `RENDER_RATE` 60/min. Redis sliding window (Lua) + in-memory fallback, fail-open on Redis outage.
3. Zod v4: `bodySchema.safeParse(await request.json().catch(() => null))` → 400 `{ error }` (Korean). Shared schemas in `@/lib/schemas`; queries via `z.coerce.number().int().min(1)`.
4. Logic in `try`; `console.error` server-side only; 500 `{ error }` Korean. Never leak stacks.

- Mutations use POST/PUT/PATCH/DELETE; GET read-only. Codes: 401 / 403 / 400 / 429 / 502 upstream / 500.
- Client on 401: `router.push("/api/auth/signin?callbackUrl=...")`; avoid redirect loops (`login/page.tsx`).
- Admin-only infra routes (`api/shards/route.ts`): `isDashboardAdmin` from `DASHBOARD_ADMIN_IDS`, **fail-closed** — unset blocks everyone.
- Refs: `api/servers/[id]/channels/route.ts`, `api/servers/[id]/settings/route.ts`.

## data-api proxy — src/lib/data-api.ts

- All Discord/bot access via data-api (Fastify); never call Discord directly with the user token.
- Env: `DATA_API_URL` (default `http://localhost:3002`) + `DATA_API_AUTH_KEY` (falls back to `AUTH_KEY`). No dashboard key → skip call (null/503); data-api refuses to start without a key (fail-closed). `Authorization` = raw key, no `Bearer` (sha256+timingSafeEqual, `apps/data-api/src/plugins/auth.ts`).
- Helpers: `fetchDataApi`/`postDataApi`/`forwardDataApi*`/`openDataApiStream`; hub: `requestPlayerSearch/Play/Control`, `fetchPlayerVoiceContext`, `requestJtcSetup`, `notifyGuildSettingsChanged`.
- Channel/role lookups (`/v1/guilds/:id/channels`, `/roles`) use Redis request/reply (`sirubot:guild-data:*`); 3s timeout, no reply = 502 `bot_timeout`.
- Timeouts: 10s JSON, 30s image render (`forwardDataApiImage`); NEVER timeout SSE (`openDataApiStream`). Pass through data-api's Korean errors; wrap bodyless failures as 502.

## Auth — next-auth v5 (src/lib/auth.ts)

- DiscordProvider: `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` (not old `AUTH_DISCORD_*`), `issuer: "https://discord.com"` (required), scope `identify guilds`; JWT maxAge 24h; session callback exposes only `session.user.id`.
- Server: `await auth()`. Client: `useSession()`. `signIn("discord")`, `signOut()`.

### Security — Discord accessToken is server-only
- `session.accessToken` is never exposed; do not reference it. Tokens only via server-side `getSessionAccessToken()` (`src/lib/session-token.ts`, both session cookies, `AUTH_SECRET`). Never pass/render tokens in client components; no client-side Discord API calls.
- Token refresh lives in server callbacks (`token-store.ts`); clients never retry expiry.
- Secrets (`AUTH_SECRET`, `SHARD_MANAGER_AUTH_KEY`, `DATA_API_AUTH_KEY`, DB/Lavalink passwords) only via `process.env`; never in code/bundles/logs (only `NEXT_PUBLIC_*` reaches clients).

## Security checklist (per PR)
- `guardRateLimit` applied; infra routes gated by `isDashboardAdmin` (fail-closed).
- No secrets/internal hosts/accessToken in client bundle (grep). Never hardcode internal addresses in clients — use `/api/...` or `src/lib/*` wrappers (`shard-api.ts` server-only).
- Mutations: correct method + zod + range re-validation (e.g. volume 0–100).
- Every route enforces server-side authorization at entry (gate above); never rely on client-side checks alone.
- External/user content rendered as text, never `dangerouslySetInnerHTML`.

Verify: `yarn workspace @sirubot/dashboard lint && ... typecheck` (lint = eslint `--max-warnings=0`, NOT prettier); `... dev` to run.