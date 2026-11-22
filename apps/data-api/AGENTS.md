# data-api agent instructions (`apps/data-api`)

Repo-wide rules live in the root `AGENTS.md`. Paths are relative to `apps/data-api/src/` unless they start with `apps/` or `packages/`. Route and hub reference: `docs/api-data-api.md`.

## Layout

- `server.ts` builds Fastify, installs the key auth hook (`plugins/auth.ts`), registers `routes/index.ts`, and starts/stops every Redis hub listed there. A new hub needs both a `start` and a `stop` entry.
- `services/*Hub.ts`: Redis hubs. Request/reply hubs (guild data, player web, JTC setup, bot admin, panel) are built with `createRequestReplyHub` (`utils/requestReplyHub.ts`). Configure a new pair the same way, and don't hand-roll correlation, pending pools or subscribers. Channel names and schemas come from the `@sirubot/utils` RPC contract, never from strings here.
- `services/playerHub.ts`: fan-in of `sirubot:player:{guildId}` into the dashboard SSE stream.
- `providers/`: outbound HTTP clients (translate, lyrics, chapters, weather, SponsorBlock, YouTube, delivery, embed-fix, Lavalink search). ISRC lookups are in `@sirubot/isrc`, not here. `utils/breaker.ts`, `cache.ts`, `dedup.ts` wrap flaky upstreams.
- `renderers/`: PNG cards, all on Takumi (`@takumi-rs/core`) in `renderers/takumi/`. Cards are **TSX** (`jsx: react-jsx`; `fromJsx` from `@takumi-rs/helpers/jsx`, no react-dom): now-playing, profile (`dashboard`/`light`/`aura`; `dark` aliases `dashboard`; `ticket` in `profileCardTicket.tsx`), Wrapped, horoscope, weather. The node-only `takumiKit.tsx` holds the font renderer singleton, `renderCardPng`, `fetchImageDataUri` (host allowlist in `images.ts`), the `Box` (a `display: flex` div, since Takumi divs default to block) and `Icon` components. Greeting is built by `greetingCard` in `@sirubot/cards` (plain objects, shared with the dashboard preview), so layout changes go in `packages/cards`. There is no fallback renderer: a failing render returns 500. `memberGreetingCard.ts` only normalizes uploaded greeting images (re-encoded through Takumi). The greeting card is the only one that can be animated (layer `animation` presets, or an animated GIF background, which Takumi plays on the card timeline and loops by its own length — `parseGifTiming` in `@sirubot/utils` reads frames and duration from the header): `renderGreetingCard` returns `{ buffer, contentType }`, `image/webp` (via `renderCardAnimation`, limited to 2 concurrent renders) when a visible layer has an `animation`, otherwise `image/png`. Card tests assert PNG signature and size (animated WebP: frame count and loop flag), not pixels. Keep `emitDecoratorMetadata` off in this package's `tsconfig.json`: with it on, tsup pre-compiles with swc, which emits classic `React.createElement` and the built cards crash with `React is not defined` (vitest does not catch this, so smoke-import `dist/renderers/takumi/*.js` after changing the build).
- Schedulers started in `server.ts`: horoscope prefetch, memory tidy, ISRC enrichment. Each needs a `stop` in `close()`.

## Env and auth

- Env schema: `config/env.ts`. The auth key is `DATA_API_AUTH_KEY ?? AUTH_KEY` (`authKeyChain` from `@sirubot/app-kit`). The same file derives the keys data-api uses to call notifier (`NOTIFIER_AUTH_KEY ?? AUTH_KEY`) and storage (`STORAGE_AUTH_KEY ?? AUTH_KEY`).
- data-api is the only app that calls notifier; the dashboard reaches it through data-api's proxy routes. For storage, data-api relays private objects (ticket transcripts), while the dashboard uploads guild image assets directly.
- `OPENAI_COMPATIBLE_API_URL` + `OPENAI_API_KEY` serve translation and custom-command drafts (`CUSTOM_COMMAND_DRAFT_MODEL`, falling back to `TRANSLATION_MODEL`). Without a key, translation returns the original text and drafts return 503.
- `SIRU_TTS_URL` unset makes the voice-list API return 503. The memory tidy job runs only when `DATABASE_URL` is set.
- ISRC enrichment (`services/isrcEnricher.ts`, `@sirubot/isrc`) runs every 10 minutes when `DATABASE_URL` is set and `ISRC_ENRICH_ENABLED` is not `false`. It looks up tracks with no ISRC (`ISRC_ENRICH_BATCH` per run) on Deezer and MusicBrainz, needs no keys, and merges chart recordings that share an ISRC (`services/recordingMerge.ts`). `MUSICBRAINZ_USER_AGENT` is optional and must not carry personal contact details.

## Run and test

- Start: `yarn workspace @sirubot/data-api build && yarn workspace @sirubot/data-api start`. Port 3002. Only `DATA_API_AUTH_KEY` (or `AUTH_KEY`) is required; without Redis the cache falls back to process memory and the hubs cannot reach a bot.
- Health: `GET /api/health`, the only unauthenticated path. `GET /dashboard` is a built-in status page and needs the key.
- Calls need `Authorization: <raw key>`.
- Single test: `yarn workspace @sirubot/data-api test src/routes/common.test.ts`.
- One-off chart backfill: `yarn workspace @sirubot/data-api backfill:recordings` (dry run by default; `--apply`, `--enrich=N`). It writes to the database, so back it up first.
