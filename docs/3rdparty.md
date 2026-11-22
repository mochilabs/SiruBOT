# SiruBOT Third-Party Component Contracts (3rdparty)

> **As of:** 2026-11-22 · **Verification method:** Every file reference was checked against the source. References are file paths only, never line numbers. Code takes precedence over documentation.
>
> **Scope:** This document covers only the contract surfaces of external software and services that SiruBOT depends on through code, configuration, or deployment.
>
> Internal architecture, Redis channels, WebSocket protocols, and environment variables are documented in [./architecture.md](./architecture.md). Data API TTLs and error mapping are documented in [./api-data-api.md](./api-data-api.md). Avoid duplicating those details here.
>
> **Agent usage:** Refer to components by their `3RD-xx` IDs. Before modifying an affected area, read its **Fragile Rules** section. If a contract changes, update this document according to [Section 5: Update Rules](#5-update-rules).

---

## Table of Contents

0. [TL;DR](#0-tldr)
1. [Lavalink Node Plugins](#1-lavalink-node-plugins): 3RD-01 mixer-plugin · 3RD-03 youtube-plugin · 3RD-04 SponsorBlock
2. [Client Libraries](#2-client-libraries): 3RD-05 lavalink-client · 3RD-06 discord.js + Sapphire · 3RD-07 Runtime Dependencies
3. [External HTTP Services](#3-external-http-services): 3RD-08 Provider Table
4. [Upgrade Playbook](#4-upgrade-playbook)
5. [Update Rules](#5-update-rules)

---

## 0. TL;DR

| ID | Component | Layer | Version / Source | Contract Surface | Most Critical Rule |
|---|---|---|---|---|---|
| 3RD-01 | `mixer-plugin` (`lavalink_mixer`) | Lavalink server plugin | Sibling project `../lavalink_mixer` (version from its git tag) | REST `/mixer/*` (v2 protocol), WebSocket `op: "mixer"` events, `pluginFilters.mixer` | Enable the filter **before** `player.play()` |
| 3RD-03 | `youtube-plugin` (official `youtube-source`) | Lavalink server plugin | `dev.lavalink.youtube:youtube-plugin` | Track loading / format resolution | Match the node's `lavaplayer` version |
| 3RD-04 | SponsorBlock API | data-api external HTTP | `sponsor.ajay.app/api/skipSegments` | millisecond skip segments | BOT controls current-track seek; mixer receives incoming start |
| 3RD-05 | `lavalink-client` | Bot client library | Patched `2.11.0` (`apps/bot/package.json`) | `LavalinkManager`, Player / QueueStore hooks | `autoSkip: false` is required |
| 3RD-06 | `discord.js` + `@sapphire/framework` | Bot framework | `^14.27.0` / `^5.5.1` | Slash command and precondition registration | Bot conventions are in `.claude/skills/sapphire-command` |
| 3RD-07 | Prisma, Redis, Fastify, Next.js, Takumi, Sentry, etc. | Runtime dependencies | See table in Section 2 | Type and client contracts | Run `yarn generate` first |
| 3RD-08 | lrclib, Open-Meteo, tracker.delivery, TV Asahi, YouTube internal API, Deezer, MusicBrainz, OpenAI-compatible LLM, side servers | External HTTP | `apps/data-api/src/providers/*`, `packages/isrc/src/providers/*`, bot clients | REST, including unofficial APIs | YouTube's internal API can change without notice |

For the overall system diagram, see [System Context in `architecture.md`, Section 2](./architecture.md#2-system-context). For the relationship between mixer and SiruBOT, consult the `../lavalink_mixer` documentation.

---

## 1. Lavalink Node Plugins

Common installation model: place plugin JARs in Lavalink's `plugins/` directory on the node. The local dev stack in `docker/docker-compose.yml` runs the stock `ghcr.io/lavalink-devs/lavalink:4` image **without** plugins, so mixer and YouTube playback are not available there unless you mount the JARs yourself. Built and deployed JARs are not tracked in this repository.

All plugin APIs target `dev.arbjerg.lavalink:plugin-api` and `dev.arbjerg:lavaplayer:2.2.6`. These versions **must match the lavaplayer version used by the node**.

### 3RD-01. `mixer-plugin` (`lavalink_mixer`)

- **Purpose:** A standalone plugin that provides gapless playback, crossfade, TTS ducking, and silence skipping without modifying Lavalink itself. It mixes PCM from a hidden secondary player for each guild at the beginning of the main filter chain.
- **Source:** Sibling project `../lavalink_mixer` (Kotlin, `dev.lavalink.mixer`). The JAR deployed to the server is a release/CI artifact from that repository.
- **SiruBOT integration:**
  - `apps/bot/src/features/music/application/mixerService.ts`: REST wrapper for `/mixer/*` (protocol types and `MixerRequestError` in `apps/bot/src/features/music/lavalink/mixerProtocol.ts`)
  - `apps/bot/src/features/music/discord/commands/settings.ts`: mixer settings live under `/설정` (music group); changing settings needs the DJ role or admin rights
  - `apps/bot/src/features/music/lavalink/handlers/nodeHandler.ts`: receives the plugin's `op: "mixer"` WebSocket events and dispatches them to `mixerHandlers.ts`
  - `apps/bot/src/features/music/lavalink/handlers/trackStartOrchestrator.ts`, `queueAdvancer.ts`: confirm track starts and advance the queue after server-side transitions
  - `apps/bot/src/services/guildSettings/mixer.ts`, `getMixerSettings()`: per-guild `MixerSettings` (gapless, crossfade and its length, normalization, AutoMix and its tempo/confidence limits)

**REST contract (v2 protocol):** The node password is sent verbatim in the `Authorization` header. The timeout is `MIXER_CALL_TIMEOUT_MS` (default 5 seconds, `apps/bot/src/lib/config.ts`). Because these paths are outside `/v4/`, the implementation uses plain `fetch` rather than `player.node.request()`. Queue mutations carry an `epoch` and an `Idempotency-Key` header and are serialized per guild.

| Endpoint | Purpose |
|---|---|
| `POST /mixer/queue/arm` | Arm the next track (`encodedTrack`, `epoch`, `isEmpty`, optional `startPositionMs`, `outgoingEndPositionMs`, `preserveTransition`) |
| `POST /mixer/queue/invalidate` | Drop the armed slot for an epoch |
| `POST /mixer/queue/override` | Play a track now (user skip) |
| `POST /mixer/reset` | Reset the guild's mixer state for a new epoch |
| `GET /mixer/state?guildId=` | Read state, including feature flags such as `adaptiveTransitionsSupported`, `bpmDetectionEnabled` and `announcementsQueued` |
| `GET /mixer/info` | Protocol version and capability flags (`incomingStartPositionSupported`, `outgoingEndPositionSupported`) |
| `POST /mixer/crossfade` | Crossfade on/off and length; also carries the AutoMix transition config |
| `POST /mixer/bpm` | AutoMix BPM detection and beatmatching (`maxTempoChange`, `minConfidence`) |
| `POST /mixer/analyze` | Ask the node to analyze the upcoming track for AutoMix (only when `adaptiveTransitionsSupported`) |
| `POST /mixer/normalization`, `POST /mixer/silence` | Volume normalization and silence trimming |
| `POST /mixer/announce` | TTS overlay with music ducking. **Queued**, replies `202 {id, position, queueLength}` |
| `POST /mixer/announce/cancel`, `DELETE /mixer/announce/queue` | Stop the active overlay; drop queued (not active) announcements. The bot uses both for the TTS `interrupt` announce mode |

All callers live in `mixerService.ts`. The plugin's `api/openapi.yaml` is the full contract.

**WebSocket events:** `nodeHandler.ts` handles `MixerNeedNextTrackEvent`, `MixerAdvancedEvent` and `MixerOverriddenEvent` (handlers in `mixerHandlers.ts`) and passes every mixer event to `mixerService.observeMixerEvent`, which records crossfade overlap ends.

**Filter contract:** Register the filter using `player.filterManager.data.pluginFilters['mixer'] = { guildId }` (`enableMixerFilter`, `mixerService.ts`). lavaplayer constructs the filter chain **only when a track starts**, so `primeForPlay()` (`mixerService.ts`) must run before `player.play()`. Call sites include `apps/bot/src/features/music/application/audioService.ts` and the Lavalink handlers (`playerHandler.ts`, `queueAdvancer.ts`, `sessionRestore.ts`). For a track that is already playing, `rebuildMixerChain()` re-sends the filters and seeks to rebuild the chain (used after a node move).

**Announce contract:** Announcements are **queued** — the old HTTP 409 "slot busy" response is gone, every request enqueues and the queue plays back to back in enqueue order through the hidden secondary player.

- `POST /mixer/announce` answers `202 {guildId, id, position, queueLength}` (`MixerAnnounceReceipt`, `mixerService.ts`). This is an enqueue receipt, **not** playback start. `position` is the 1-based order among queued announcements at enqueue time and `queueLength` is the queue size after this enqueue; the currently speaking overlay is in neither count.
- Progress: `announcementsQueued` (integer) in `GET /mixer/state`, or the plugin's announce start/end WebSocket events. The bot does not act on the announce events today.
- `DELETE /mixer/announce/queue` drops queued (not active) announcements and reports the drop count; `POST /mixer/announce/cancel` stops the active overlay only.
- A queued identifier is resolved at start time, so freshly synthesized TTS URLs stay valid while waiting.

**Client contract:** Create `lavalink-client` with `autoSkip: false` (`apps/bot/src/core/botApplication.ts`). Skipping must go through the mixer so the server-side slot stays synchronized; do not call `player.skip()` directly.

**Fragile Rules:**

1. **Filter priming order:** If the filter is primed after `play()`, the effect is absent. Prime it before playback.
2. **`guildId` must be a string.** Discord snowflakes exceed JavaScript's safe integer range (`2^53`); sending them as JSON numbers can corrupt them. Keep `guildId` string-valued in filter payloads.
3. **Announcements queue; there is no 409:** `POST /mixer/announce` never reports "busy" — repeat calls stack into the queue and play sequentially. Surface the `position` from the `202` receipt instead of a retry hint, and do not treat a `202` as "speaking now".
4. **Clamp crossfade duration:** The plugin accepts 500–30,000 ms; SiruBOT restricts it to 500–15,000 ms (`mixerService.ts`, `packages/utils/src/guildSettingsContract.ts`). Review both sides when changing the contract.
5. **Confirm track starts:** Do not trust the server's `trackStart` payload blindly. Match it with `resolveStartedTrack` in `trackStartOrchestrator.ts`; keep the confirmation window controlled by `MIXER_CONFIRM_TIMEOUT_MS` (default 5 seconds, `apps/bot/src/lib/config.ts`, used in `queueAdvancer.ts`).
6. **Respect capability flags:** Send `startPositionMs`/`outgoingEndPositionMs` only when `/mixer/info` reports support, and AutoMix calls only when `/mixer/state` reports the BPM fields; otherwise `setAutomix` throws `AutomixUnsupportedError` (`mixerService.ts`).

### 3RD-03. `youtube-plugin` (Official `youtube-source`)

- **Purpose:** The de facto standard implementation for loading YouTube tracks, resolving formats, and streaming. 3RD-01's auxiliary player also decodes tracks through this source.
- **SiruBOT integration:** Indirect. `apps/data-api/src/providers/lavalinkSearch.ts` delegates search to Lavalink REST `GET /v4/loadtracks?identifier=ytsearch:...`; this plugin provides the underlying source implementation.

### 3RD-04. SponsorBlock API

- `apps/data-api/src/providers/sponsorblock.ts` requests only `actionType=skip`, validates the response, and converts seconds to integer milliseconds. `routes/cache-providers.ts` caches positive results for 24 hours, empty results for one hour, and serves a positive seven-day stale copy during upstream failure.
- `apps/bot/src/features/music/application/sponsorBlockService.ts` selects each guild's categories and seeks the current player. It suppresses seeks across an active crossfade boundary.
- For the next track, BOT passes the leading skip end as `startPositionMs` in `POST /mixer/queue/arm` when `/mixer/info` reports `incomingStartPositionSupported`. For an outgoing outro, BOT sends `outgoingEndPositionMs` when the node reports `outgoingEndPositionSupported`; the mixer ends its fade at that position. Deploy the updated mixer before BOT. Remove the old Lavalink SponsorBlock plugin after BOT and data-api are live.

---

## 2. Client Libraries

### 3RD-05. `lavalink-client`

- **Version:** `2.11.0` with a Yarn patch (`apps/bot/package.json`). Lavalink v4 client built around `LavalinkManager`, `Player`, and queue-store hooks.
- **SiruBOT integration:**
  - Initialization/configuration: `apps/bot/src/core/botApplication.ts`, `setupAudio()` (`playerClass: CustomPlayer`, `queueOptions.queueStore`, `sendToShard`, node `retryAmount: 9999`)
  - Extension: `apps/bot/src/features/music/lavalink/player/customPlayer.ts` (`TransitionState {stopByCommand, lastStartedEncoded, preloadConsumedAt}`, chapters, error counts)
  - Queue persistence: `apps/bot/src/features/music/lavalink/queue/queueStore.ts` (`CachedQueueStore`)
  - Node lifecycle: `apps/bot/src/features/music/lavalink/handlers/nodeHandler.ts`; session recovery keys `lavalink/session/{nodeId}/shards:{0,1}` (`redisStore.ts`)
- **Fragile Rules:**
  1. **`autoSkip: false` is required** (`apps/bot/src/core/botApplication.ts`). If enabled, it conflicts with the server-side auto-start behavior in 3RD-01. Upstream 2.11.0 still shifts the queue or sends a stop after emitting `trackStuck` with this option disabled. The Yarn patch returns after the event so the bot owns recovery in both the CJS and ESM builds (`patches/lavalink-client-npm-2.11.0-5e0ef08b0c.patch`). Without it, a mixer skip can be followed by another queue shift or a stop of the replacement track.
  2. **Route skips through the mixer, not `player.skip()`.** See the related rule in 3RD-01.
  3. **Custom Player/QueueStore hooks are internal APIs.** For major upgrades, review `customPlayer.ts`, `queueStore.ts`, and `trackHandler.ts` first.
  4. **Session resume:** Store session IDs in Redis when a node becomes `ready` and restore them after restart. This interacts with Lavalink's five-minute resume window; follow the shutdown order in `docs/runbook-production.md`.

### 3RD-06. `discord.js` + `@sapphire/framework`

- **Versions:** `discord.js ^14.27.0` (`apps/bot`, `packages/utils`), `@sapphire/framework ^5.5.1` plus `@sapphire/plugin-subcommands ^7.0.1`.
- **Contract surface:** Registration conventions for slash commands, preconditions, and interaction handlers (Sapphire stores). Follow `apps/bot/AGENTS.md` and the `sapphire-command` skill (`.claude/skills/sapphire-command/SKILL.md`). Avoid duplicating those conventions here.
- **Fragile Rule:** Each music subcommand exports its precondition list (`preconditions` in `apps/bot/src/features/music/discord/subcommands/*.ts`), and the order is part of the permission and voice-state contract. Control commands run `TextChannelAllowed`, `NodeAvailable`, `VoiceConnected`, `SameVoiceChannel`, `SongPlaying`, `DJOrAlone`; play and search run only `TextChannelAllowed`, `NodeAvailable`, `MemberListenable` and leave the voice-channel decision to the use case (`features/music/application/play.ts`). Changing the order changes which error a user sees first.

### 3RD-07. Runtime Dependencies (Version Pins)

| Library | Version | Used In | Notes |
|---|---|---|---|
| `@prisma/client` / `prisma` | `^7.10.1` | `packages/prisma` | Run `yarn generate` before type checking/building (`AGENTS.md` Commands). |
| `@prisma/adapter-pg` | `^7.10.1` | bot/dashboard/data-api | PrismaPg adapter |
| `@redis/client` | `^5.12.1` (bot/data-api/utils), `^6.3.0` (dashboard only) | All apps | **Version mismatch:** dashboard may use a different Redis client API. Take care when porting shared code to dashboard. |
| `fastify` | `^5.12.7` | data-api/shardmanager | `@fastify/websocket ^11.3.4`, `@fastify/autoload ^6.5.1` |
| `next` / `react` | `16.4.3` / `19.3.1` | dashboard | Dev uses `--webpack`; build uses `--turbopack` (`AGENTS.md`). |
| `@takumi-rs/core` / `@takumi-rs/wasm` / `@takumi-rs/helpers` / `react` | `^2.22.1` / `^2.22.1` / `^2.22.1` / `19.3.1` | data-api (`core`), dashboard (`wasm`) | Every card renderer (`apps/data-api/src/renderers/`, written as TSX) and browser greeting preview (`@takumi-rs/wasm`). `react` on data-api is only the JSX runtime and types; `fromJsx` runs without react-dom |
| `youtubei.js` | `18.3.0` (exact pin) | data-api | See 3RD-08e |
| `zod` | `^4.6.7` | All apps | Contract schema language |
| `ws` | `^8.22.0` | shardmanager/shardclient | Shard WebSocket protocol |
| `@sentry/node` + `@sentry/profiling-node` | `^9.47.2` | bot/utils | `apps/bot/src/core/sentry.ts` |
| `undici` / `tslog` | `^7.30.1` / `^4.11.0` | bot/data-api/shardmanager/utils | HTTP / logging |

---

## 3. External HTTP Services

Most providers are called from `apps/data-api/src/providers/*`; the ISRC lookups live in `packages/isrc`, and a few side servers are called by the bot directly (3RD-08j to 3RD-08m). **TTL behavior, error mapping, and endpoint schemas are defined in [./api-data-api.md](./api-data-api.md)**. This section documents only the contract surface: target, caller, and risk.

| ID | Target | Endpoint / Source | Caller | Contract Risk |
|---|---|---|---|---|
| 3RD-08a | lrclib (lyrics) | `https://lrclib.net/api/search` | `providers/lyrics.ts` | Unofficial public API; rate-limit policy may change. |
| 3RD-08b | Open-Meteo (weather, air quality, geocoding) | `api.open-meteo.com`, `air-quality-api.open-meteo.com`, `geocoding-api.open-meteo.com` | `providers/weather.ts` | Public API; free-tier policies may change. |
| 3RD-08c | tracker.delivery (parcel tracking) | `https://apis.tracker.delivery` | `providers/delivery.ts` | API-key and pricing-plan contract. |
| 3RD-08d | TV Asahi / Asahi horoscope | `tv-asahi.co.jp/goodmorning/uranai/`, `asahi.co.jp/data/ohaasa2020/horoscope.json` | `providers/ohaasa.ts` | **Scraping / unofficial JSON.** Breaks if page structure changes; keep the parser isolated. |
| 3RD-08e | YouTube.js | `youtubei.js` package | `providers/youtubeClient.ts`, `providers/chapters.ts`, `providers/youtubeSuggestions.ts` | The library wraps unofficial YouTube endpoints; parser/API changes require provider tests and manual chapter checks. |
| 3RD-08f | OpenAI-compatible LLM | `OPENAI_COMPATIBLE_API_URL` (default `http://127.0.0.1:8080/v1`, `apps/data-api/src/config/env.ts`) | Translation / AI batch providers, including `providers/translate.ts` | Assumes self-hosting; model and key are configured via environment variables. |
| 3RD-08g | Lavalink REST (search proxy) | `GET {LAVALINK_REST_URL}/v4/loadtracks` | `providers/lavalinkSearch.ts` | Depends on 3RD-03. Sends the node password verbatim in `Authorization`. |
| 3RD-08h | Deezer (ISRC lookup) | `https://api.deezer.com` | `packages/isrc/src/providers/deezer.ts`, run by `apps/data-api/src/services/isrcEnricher.ts` | Public, keyless API. The enricher is rate-limited (`packages/isrc/src/rateLimit.ts`) and runs every 10 minutes. |
| 3RD-08i | MusicBrainz (ISRC lookup) | `https://musicbrainz.org/ws/2` | `packages/isrc/src/providers/musicbrainz.ts` | Requires a descriptive User-Agent (`MUSICBRAINZ_USER_AGENT`, default in the provider). Strict per-client rate limit. |
| 3RD-08j | OpenAI-compatible LLM (bot side) | `OPENAI_COMPATIBLE_API_URL` + `CHAT_MODEL` | `apps/bot/src/features/ai-chat/`, emoji image reading in `apps/bot/src/features/emoji-maker/application/imageReader.ts` | Chat is off without `CHAT_MODEL`. Vision input depends on the model accepting `data:` image URLs. |
| 3RD-08k | siru-tts (sibling side server) | `SIRU_TTS_URL` | `apps/bot/src/features/tts/`, voice catalog via data-api `routes/tts.ts` | TTS is off without the URL. |
| 3RD-08l | siru_moji (sibling side server) | `SIRU_MOJI_URL`, key `SIRU_MOJI_AUTH_KEY ?? AUTH_KEY` | `apps/bot/src/features/emoji-maker/application/mojiClient.ts` | `/이모지만들기` is off without the URL. |
| 3RD-08m | Web search for AI tools | SearXNG at `SEARXNG_BASE_URL` (toggle `ENABLE_SEARXNG`), fallback `lite.duckduckgo.com` | `apps/bot/src/features/ai-chat/application/aiTools/searchEngine.ts` | The DuckDuckGo fallback scrapes HTML and can break without notice. |

Authentication conventions (raw HTTP `Authorization` header and Redis hub channels) are documented in [Shared Contracts, Section 5 of `architecture.md`](./architecture.md#5-shared-contracts).

---

## 4. Upgrade Playbook

### A. Replacing Node Plugin JARs (3RD-01, 3RD-03–04)

1. Verify that the target plugin's `plugin-api` and `lavaplayer` versions match the node's versions. 3RD-01 is built against `lavaplayer:2.2.6`.
2. When replacing 3RD-01, compare the REST contract in `api/openapi.yaml` with requests in `mixerService.ts`, especially the crossfade clamp (500–15,000 ms versus 500–30,000 ms).
3. After restarting, verify the response schema for `/mixer/state`.
4. Compare deployment environment variables against the defaults hard-coded in code: `MIXER_CONFIRM_TIMEOUT_MS` and `MIXER_CALL_TIMEOUT_MS`.

### B. Upgrading `lavalink-client` (3RD-05)

1. Review `customPlayer.ts`, `queueStore.ts`, `trackHandler.ts`, `trackStartOrchestrator.ts`, `queueAdvancer.ts` and `features/music/application/sponsorBlockService.ts` first; they depend on internal APIs and event payloads.
2. Run `yarn vitest run --config vitest.config.ts apps/bot/src/features/music/lavalink/handlers/trackStuckRecovery.test.ts`. Keep the `trackStuck` patch until the replacement version passes this regression suite without it. The suite exercises the installed CJS and ESM handlers with the real mixer skip, checks that recovery advances once, and preserves `autoSkip: true` behavior (`apps/bot/src/features/music/lavalink/handlers/trackStuckRecovery.test.ts`).
3. Measure the node session-resume scenario in practice, including recovery of session IDs from Redis.

### C. Upgrading Prisma, Redis, Next.js, and Other 3RD-07 Dependencies

1. Run `yarn generate` → `yarn typecheck` → `yarn test` in that order (`AGENTS.md`, Commands).
2. Decide whether to resolve the mixed `@redis/client` v5/v6 usage before proceeding.
3. Account for the different lint/format checks: the dashboard uses ESLint, while the other apps use Prettier (`AGENTS.md`).

### D. When an External Service (3RD-08) Breaks

1. Keep contract-specific code isolated under `providers/*`; do not leak provider-specific parsers or clients throughout the application.
2. When modifying scraping targets (TV Asahi, YouTube internal APIs), preserve fallback paths. If no fallback is possible, return an explicit error state rather than disguising failure as empty data.

---

## 5. Update Rules

1. This document is governed by the “Code Is the Source of Truth” rule in [`./README.md`](./README.md). When a contract changes—endpoint, payload, environment variable, event, or key convention—update the relevant `3RD-xx` section in the same PR.
2. Every behavioral claim must cite the file that implements it. Use file paths only, never line numbers (`./README.md`, writing rule 2).
3. The sibling project `../lavalink_mixer` is authoritative. This document is a snapshot as of the date at the top. If a discrepancy is found, **the sibling-project code takes precedence** and this document must be corrected.
4. Add a **Fragile Rule** only when supported by an actual failure or a constraint enforced by code, ordering, or types. Label speculation as a hypothesis.
5. Do not include statistics or performance figures without a source.
