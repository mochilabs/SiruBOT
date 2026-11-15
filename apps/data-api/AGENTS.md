# data-api agent instructions (`apps/data-api`)

Repo-wide rules live in the root `AGENTS.md`. Paths are relative to `apps/data-api/src/` unless they start with `apps/` or `packages/`. Route and hub reference: `docs/api-data-api.md`.

## Layout

- `server.ts` builds Fastify, installs the key auth hook (`plugins/auth.ts`), registers `routes/index.ts`, and starts/stops every Redis hub listed there. A new hub needs both a `start` and a `stop` entry.
- `services/*Hub.ts`: Redis hubs. Request/reply hubs (guild data, player web, JTC setup, bot admin, panel) are built with `createRequestReplyHub` (`utils/requestReplyHub.ts`). Configure a new pair the same way, and don't hand-roll correlation, pending pools or subscribers. Channel names and schemas come from the `@sirubot/utils` RPC contract, never from strings here.
- `services/playerHub.ts`: fan-in of `sirubot:player:{guildId}` into the dashboard SSE stream.
- `providers/`: outbound HTTP clients (translate, lyrics, chapters, weather, SponsorBlock, YouTube). `renderers/`: canvas image cards. `utils/breaker.ts`, `cache.ts`, `dedup.ts` wrap flaky upstreams.

## Env and auth

- Env schema: `config/env.ts`. The auth key is `DATA_API_AUTH_KEY ?? AUTH_KEY` (`authKeyChain` from `@sirubot/app-kit`). The same file derives the keys data-api uses to call notifier (`NOTIFIER_AUTH_KEY ?? AUTH_KEY`) and storage (`STORAGE_AUTH_KEY ?? AUTH_KEY`).
- data-api is the only app that calls notifier; the dashboard reaches it through data-api's proxy routes. For storage, data-api relays private objects (ticket transcripts), while the dashboard uploads guild image assets directly.
- `OPENAI_COMPATIBLE_API_URL` + `OPENAI_API_KEY` serve translation and custom-command drafts (`CUSTOM_COMMAND_DRAFT_MODEL`, falling back to `TRANSLATION_MODEL`). Without a key, translation returns the original text and drafts return 503.
- `SIRU_TTS_URL` unset makes the voice-list API return 503. The memory tidy job runs only when `DATABASE_URL` is set.
- ISRC enrichment (`services/isrcEnricher.ts`, `@sirubot/isrc`) runs every 10 minutes when `DATABASE_URL` is set and `ISRC_ENRICH_ENABLED` is not `false`. It looks up tracks with no ISRC (`ISRC_ENRICH_BATCH` per run) on Deezer and MusicBrainz, needs no keys, and merges chart recordings that share an ISRC (`services/recordingMerge.ts`). `MUSICBRAINZ_USER_AGENT` is optional and must not carry personal contact details.
