# SiruBOT Third-Party Component Contracts (3rdparty)

> **Document date:** 2026-10-16 · **Verification method:** All `file-path:line` references were checked against the actual source. Code takes precedence over documentation.
>
> **Scope:** This document covers only the contract surfaces of external software and services that SiruBOT depends on through code, configuration, or deployment.
>
> Internal architecture, Redis channels, WebSocket protocols, and environment variables are documented in [./architecture.md](./architecture.md). Data API TTLs and error mapping are documented in [./api-data-api.md](./api-data-api.md). Avoid duplicating those details here.
>
> **Agent usage:** Refer to components by their `3RD-xx` IDs. Before modifying an affected area, read its **Fragile Rules** section. If a contract changes, update this document according to [Section 5: Update Rules](#5-update-rules).

---

## Table of Contents

0. [TL;DR](#0-tldr)
1. [Lavalink Node Plugins](#1-lavalink-node-plugins): 3RD-01 mixer-plugin · 3RD-02 youtube-file-cache · 3RD-03 youtube-plugin · 3RD-04 SponsorBlock
2. [Client Libraries](#2-client-libraries): 3RD-05 lavalink-client · 3RD-06 discord.js + Sapphire · 3RD-07 Runtime Dependencies
3. [External HTTP Services](#3-external-http-services): 3RD-08 Provider Table
4. [Upgrade Playbook](#4-upgrade-playbook)
5. [Update Rules](#5-update-rules)

---

## 0. TL;DR

| ID | Component | Layer | Version / Source | Contract Surface | Most Critical Rule |
|---|---|---|---|---|---|
| 3RD-01 | `mixer-plugin` (`lavalink_mixer`) | Lavalink server plugin | Sibling project `../lavalink_mixer`, v1.0.0 | REST `/mixer/*`, `pluginFilters.mixer` | Enable the filter **before** `player.play()` |
| 3RD-02 | `youtube-file-cache` (`lavalink_file_cache`) | Lavalink server plugin | Sibling project `../lavalink_file_cache`, v0.1.0 | lavaplayer `AudioSourceManager`, REST `/youtube-file-cache/stats` | Cache key = YouTube `identifier` (videoId) |
| 3RD-03 | `youtube-plugin` (official `youtube-source`) | Lavalink server plugin | `dev.lavalink.youtube:youtube-plugin:1.18.2` | Track loading / format resolution | 3RD-02 depends on its **internal APIs** |
| 3RD-04 | SponsorBlock plugin | Lavalink server plugin | Installed separately on nodes | `SegmentSkipped` / `ChaptersLoaded` events | Guilds without registered categories receive no chapter events |
| 3RD-05 | `lavalink-client` | Bot client library | `^2.10.0` (`apps/bot/package.json`) | `LavalinkManager`, Player / QueueStore hooks | `autoSkip: false` is required |
| 3RD-06 | `discord.js` + `@sapphire/framework` | Bot framework | `^14.27.0` / `^5.3.6` | Slash command and precondition registration | Bot conventions are in `.pi/skills/sapphire-command` |
| 3RD-07 | Prisma, Redis, Fastify, Next.js, Sentry, etc. | Runtime dependencies | See table in Section 2 | Type and client contracts | Run `yarn generate` first |
| 3RD-08 | lrclib, Open-Meteo, tracker.delivery, TV Asahi, YouTube internal API, OpenAI-compatible LLM | External HTTP | `apps/data-api/src/providers/*` | REST, including unofficial APIs | YouTube's internal API can change without notice |

For the overall system diagram, see [System Context in `architecture.md`, Section 2](./architecture.md#2-시스템-컨텍스트). For the relationship among mixer, file-cache, and SiruBOT, consult the corresponding sibling-project documentation.

---

## 1. Lavalink Node Plugins

Common installation model: place plugin JARs in Lavalink's `plugins/` directory. For Docker deployments, `docker/docker-compose.yml` mounts `./lavalink/plugins:/opt/Lavalink/plugins`. This directory is gitignored, so built and deployed JARs are not tracked in the repository.

All plugin APIs target `dev.arbjerg.lavalink:plugin-api` and `dev.arbjerg:lavaplayer:2.2.6`. These versions **must match the lavaplayer version used by the node**.

### 3RD-01. `mixer-plugin` (`lavalink_mixer`)

- **Purpose:** A standalone plugin that provides gapless playback, crossfade, TTS ducking, and silence skipping without modifying Lavalink itself. It mixes PCM from a hidden secondary player for each guild at the beginning of the main filter chain.
- **Source:** Sibling project `../lavalink_mixer` (Kotlin, `dev.lavalink.mixer`). The JAR deployed to the server is a release/CI artifact from that repository.
- **SiruBOT integration:**
  - `apps/bot/src/services/mixerService.ts` (363 lines): complete REST wrapper for `/mixer/*`
  - `apps/bot/src/modules/audio/commands/mixer.ts`: `/music mixer` slash command
  - `apps/bot/src/modules/audio/lavalink/handlers/trackHandler.ts`: server-side auto-start and transition handling
  - `apps/bot/src/services/guildService.ts`, `getMixerSettings()`: `MixerSettings {gaplessEnabled, crossfadeEnabled, crossfadeMs}`

**REST contract:** The node password is sent verbatim in the `Authorization` header. The timeout is `MIXER_CALL_TIMEOUT_MS` (default 5 seconds; `mixerService.ts:7,84`). Because these paths are outside `/v4/`, the implementation uses plain `fetch` rather than `player.node.request()`.

| Endpoint | Purpose | Caller |
|---|---|---|
| `POST /mixer/queue/next` | Preload the next track (`identifier` or `encodedTrack`) | `mixerService.ts:172` |
| `DELETE /mixer/queue/next?guildId=` | Remove the preloaded slot | `mixerService.ts:231` |
| `POST /mixer/crossfade` | Configure crossfade (`durationMs`) | `mixerService.ts:253,317` |
| `GET /mixer/state?guildId=` | Read state (`hasNext`, `nextTrimMs`, `announcementsQueued`, etc.) | `mixerService.ts:325` |
| `POST /mixer/announce` | TTS overlay and music ducking — **queued**, replies `202 {id, position, queueLength}` | `mixerService.ts:334` |
| `POST /mixer/announce/cancel`, `DELETE /mixer/announce/queue`, `POST /mixer/silence`, `POST /mixer/fade-in` | Stop the active overlay, drop queued announcements, tune silence, fade in | Not called by the bot; intended for agents/manual use. See the plugin's `api/openapi.yaml`. |

**Filter contract:** Register the filter using `player.filterManager.data.pluginFilters['mixer'] = { guildId }` (`enableMixerFilter`, `mixerService.ts:111`). lavaplayer constructs the filter chain **only when a track starts**, so `primeForPlay()` (`mixerService.ts:298`) must run before `player.play()`. Current call sites include `apps/bot/src/services/audioService.ts:321` and `apps/bot/src/services/aiTools/music.ts:326`.

**Announce contract:** Announcements are **queued** — the old HTTP 409 "slot busy" response is gone, every request enqueues and the queue plays back to back in enqueue order through the hidden secondary player.

- `POST /mixer/announce` answers `202 {guildId, id, position, queueLength}` (`MixerAnnounceReceipt`, `mixerService.ts:333-340`). This is an enqueue receipt, **not** playback start. `position` is the 1-based order among queued announcements at enqueue time and `queueLength` is the queue size after this enqueue; the currently speaking overlay is in neither count.
- Progress: `announcementsQueued` (integer) in `GET /mixer/state`, or the plugin's WebSocket frames (raw-message hook, `payload.op === "mixer"`): `{"op":"mixer","type":"announceStart","guildId","announcementId","track":{identifier,title}}` when a queued item starts talking over the music, `{"op":"mixer","type":"announceEnd","guildId"}` when the overlay ends (natural end, cancel, or sub failure). The bot does not consume these events today.
- `DELETE /mixer/announce/queue` drops queued (not active) announcements and reports the drop count; `POST /mixer/announce/cancel` stops the active overlay only.
- A queued identifier is resolved at start time, so freshly synthesized TTS URLs stay valid while waiting.

**Client contract:** Create `lavalink-client` with `autoSkip: false` (`apps/bot/src/core/botApplication.ts:141`). Skipping must go through the mixer so the server-side slot stays synchronized; do not call `player.skip()` directly.

**Fragile Rules:**

1. **Filter priming order:** If the filter is primed after `play()`, the effect is absent. Prime it before playback.
2. **`guildId` must be a string.** Discord snowflakes exceed JavaScript's safe integer range (`2^53`); sending them as JSON numbers can corrupt them. Keep `guildId` string-valued in filter payloads.
3. **Announcements queue; there is no 409:** `POST /mixer/announce` never reports "busy" — repeat calls stack into the queue and play sequentially. Surface the `position` from the `202` receipt instead of a retry hint, and do not treat a `202` as "speaking now".
4. **Clamp crossfade duration:** The plugin accepts 500–30,000 ms; SiruBOT restricts it to 500–15,000 ms (`mixerService.ts:252`, command options `mixer.ts:62-64`). Review both sides when changing the contract.
5. **Confirm track starts:** Do not trust the server's `trackStart` payload blindly. Match by identifier using `resolveStartedTrack` in `trackHandler.ts`; retain the watchdog controlled by `MIXER_CONFIRM_TIMEOUT_MS` (default 5 seconds, `trackHandler.ts:32`). This contract interacts with 3RD-02.

### 3RD-02. `youtube-file-cache` (`lavalink_file_cache`)

- **Purpose:** Caches YouTube audio on disk without modifying the official `youtube-source` plugin. Cache hits play local files; cache misses stream immediately while downloading in the background. It includes LRU eviction and per-videoId file locking.
- **Source:** Sibling project `../lavalink_file_cache` (Java 17, `dev.lavalink.youtube.cache`, v0.1.0).
- **SiruBOT integration:** No direct code-level reference. The dependency is contractual. Exceptions include display-name mapping in `apps/dashboard/src/utils/index.ts:8` (`"youtube-file-cache": "Youtube"`), source detection via `isYouTubeSource()` in `packages/utils/src/lavalinkTrack.ts` (prefix `youtube`), and videoId extraction via `resolveYouTubeVideoId()` (`lavalinkTrack.ts:17-18`).

**Contract:**

1. **Cache key = YouTube `identifier` (videoId).** Mixer preloading refers to `identifier: videoId`, matching the file-cache key (`mixerService.ts:109-118`, `trackRef()`; comment: for YouTube, `identifier` is the videoId and therefore matches the file-cache key).
2. **Stale metadata:** A cached track's `trackStart` payload may contain an old title or duration. Reconstruct display metadata using the identifier (`trackHandler.ts:342` comment).
3. **Stats endpoint is currently broken:** `GET /youtube-file-cache/stats` always reports zero because the sibling project's `CacheStatsController.snapshotMap()` creates a new collector instance instead of using the actual counters held by `YoutubeFileCacheSourceManager`. Do not use this endpoint for monitoring. To inspect values, examine `.properties` files directly in the configured cache directory.
4. **Configuration keys** under Lavalink `application.yaml` → `plugins.youtube-file-cache`: `enabled`, `directory` (default `./youtube-cache`), `max-size-mb` (1024), `download-threads` (2), `failure-cooldown-minutes` (30), `min-free-disk-mb` (500), `prefetch-limit` (10), and `max-track-length-minutes` (30).

**Fragile Rules:**

1. **Preserve the encoded track's source name.** Queued encoded tracks retain the `youtube-file-cache` source name. When changing source-name comparisons, also review the prefix match in `isYouTubeSource()`.
2. **Do not cache live/segmented URLs.** Do not design latency calculations (for example, mixer silence-analysis cache lifetime) under the assumption that all sources are cached.
3. **Shared directories across multiple nodes:** Per-videoId `FileLock` prevents duplicate downloads, but LRU accounting is per node. Plan capacity based on the number of nodes.
4. **`prefetch-limit` applies only to the first N playlist tracks.** Playlist prefetch and the mixer's one-track-ahead preload can compete for download threads.

### 3RD-03. `youtube-plugin` (Official `youtube-source`)

- **Purpose:** The de facto standard implementation for loading YouTube tracks, resolving formats, and streaming. 3RD-02 is built on top of it, and 3RD-01's auxiliary player also decodes tracks through this source.
- **Version:** `dev.lavalink.youtube:youtube-plugin:1.18.2`, based on the compile dependency in 3RD-02's `build.gradle.kts`. A locally built artifact can replace the Maven artifact; `-PuseMavenYoutube` forces the Maven dependency.
- **SiruBOT integration:** Indirect. `apps/data-api/src/providers/lavalinkSearch.ts` delegates search to Lavalink REST `GET /v4/loadtracks?identifier=ytsearch:...`; this plugin provides the underlying source implementation.
- **Fragile Rule:** 3RD-02 depends on **private internal APIs** of this plugin, including `YoutubeAudioSourceManager.getClients()`, `getCipherManager()`, and `buildAudioTrack()` (for example, `YoutubeFileCacheSourceManager.java:390`). Whenever 3RD-03 is upgraded, **rebuild and retest 3RD-02**. Upgrading 3RD-03 alone while leaving the old 3RD-02 JAR in place can cause runtime linkage errors.

### 3RD-04. SponsorBlock Plugin

- **Purpose:** Provides segment skipping (sponsors, intros, etc.) and chapter information.
- **SiruBOT integration:**
  - Registration: `apps/bot/src/modules/audio/lavalink/handlers/playerHandler.ts:39` (`player.setSponsorBlock(validSegments)`); guild segment selection is in `apps/bot/src/modules/audio/interaction-handlers/settings.ts:192-194`.
  - Events: `apps/bot/src/modules/audio/lavalink/handlers/sponsorBlockHandler.ts:11-12` (`ChaptersLoaded`, `SegmentSkipped`); user notification message at `sponsorBlockHandler.ts:46`.
  - `ChaptersLoaded` is emitted only for guilds that have registered categories (`trackHandler.ts:416` comment). An empty chapter UI may therefore be expected behavior.
- **Fragile Rule:** Event names must match `lavalink-client` types (`SponsorBlockChaptersLoaded`, `SponsorBlockSegmentSkipped`). When upgrading 3RD-05, verify event payload and type changes.

---

## 2. Client Libraries

### 3RD-05. `lavalink-client`

- **Version:** `^2.10.0` (`apps/bot/package.json`). Lavalink v4 client built around `LavalinkManager`, `Player`, and queue-store hooks.
- **SiruBOT integration:**
  - Initialization/configuration: `apps/bot/src/core/botApplication.ts`, `setupAudio()` (`playerClass: CustomPlayer`, `queueOptions.queueStore`, `sendToShard`, node `retryAmount: 9999`)
  - Extension: `apps/bot/src/modules/audio/lavalink/player/customPlayer.ts` (`TransitionState {stopByCommand, lastStartedEncoded, preloadConsumedAt}`, chapters, error counts)
  - Queue persistence: `apps/bot/src/modules/audio/lavalink/queue/queueStore.ts` (`CachedQueueStore`)
  - Node lifecycle: `apps/bot/src/modules/audio/lavalink/handlers/nodeHandler.ts`; session recovery keys `lavalink/session/{nodeId}/shards:{0,1}` (`redisStore.ts:23,39`)
- **Fragile Rules:**
  1. **`autoSkip: false` is required** (`botApplication.ts:141`). If enabled, it conflicts with the server-side auto-start behavior in 3RD-01.
  2. **Route skips through the mixer, not `player.skip()`.** See the related rule in 3RD-01.
  3. **Custom Player/QueueStore hooks are internal APIs.** For major upgrades, review `customPlayer.ts`, `queueStore.ts`, and `trackHandler.ts` first.
  4. **Session resume:** Store session IDs in Redis when a node becomes `ready` and restore them after restart. This interacts with Lavalink's five-minute resume window; follow the shutdown order in `docs/runbook-production.md`.

### 3RD-06. `discord.js` + `@sapphire/framework`

- **Versions:** `discord.js ^14.27.0` (`apps/bot`), `@sapphire/framework ^5.3.6` plus plugins such as `plugin-subcommands ^7.0.1` and `discord.js-utilities ^7.3.3`. In `apps/dashboard` and `apps/data-api`, `discord.js ^14.0.0` is used for types/utilities.
- **Contract surface:** Registration conventions for slash commands, preconditions, and interaction handlers (Sapphire stores). Follow `AGENTS.md` under “Bot conventions” and the `sapphire-command` skill (`.pi/skills/sapphire-command/SKILL.md`). Avoid duplicating those conventions here.
- **Fragile Rule:** The order of the precondition chain (`NodeAvailable`, `VoiceConnected`, `SameVoiceChannel`, `DJOrAlone`) is part of the permission and voice-state contract. Changing the order changes command-entry conditions.

### 3RD-07. Runtime Dependencies (Version Pins)

| Library | Version | Used In | Notes |
|---|---|---|---|
| `@prisma/client` / `prisma` | `^7.7.0` | `packages/prisma` | Run `yarn generate` before type checking/building (`AGENTS.md` Commands). |
| `@prisma/adapter-pg` | `^7.7.0` | bot/dashboard/data-api | PrismaPg adapter |
| `@redis/client` | `^5.8.2` (bot/data-api/utils/shardclient), `^6.3.0` (dashboard only) | All apps | **Version mismatch:** dashboard may use a different Redis client API. Take care when porting shared code to dashboard. |
| `fastify` | `^5.12.7` | data-api/shardmanager | `@fastify/websocket ^11.2.0`, `@fastify/autoload ^6.3.1` |
| `next` / `react` | `16.4.0` / `19.x` | dashboard | Dev uses `--webpack`; build uses `--turbopack` (`AGENTS.md`). |
| `zod` | `^4.x` (minor differences by app) | All apps | Contract schema language |
| `ws` | `^8.18.3` | shardmanager/shardclient | Shard WebSocket protocol |
| `@sentry/node` + `@sentry/profiling-node` | `^9.15.0` | bot/utils | `apps/bot/src/core/sentry.ts` |
| `undici` / `tslog` | bot/data-api/utils | HTTP / logging | |

---

## 3. External HTTP Services

All providers are called from `apps/data-api/src/providers/*`. **TTL behavior, error mapping, and endpoint schemas are defined in [./api-data-api.md](./api-data-api.md)**. This section documents only the contract surface: target, caller, and risk.

| ID | Target | Endpoint / Source | Caller | Contract Risk |
|---|---|---|---|---|
| 3RD-08a | lrclib (lyrics) | `https://lrclib.net/api/search` | `providers/lyrics.ts:3` | Unofficial public API; rate-limit policy may change. |
| 3RD-08b | Open-Meteo (weather, air quality, geocoding) | `api.open-meteo.com`, `air-quality-api.open-meteo.com`, `geocoding-api.open-meteo.com` | `providers/weather.ts:3-5` | Public API; free-tier policies may change. |
| 3RD-08c | tracker.delivery (parcel tracking) | `https://apis.tracker.delivery` | `providers/delivery.ts:1` | API-key and pricing-plan contract. |
| 3RD-08d | TV Asahi / Asahi horoscope | `tv-asahi.co.jp/goodmorning/uranai/`, `asahi.co.jp/data/ohaasa2020/horoscope.json` | `providers/ohaasa.ts:99,131` | **Scraping / unofficial JSON.** Breaks if page structure changes; keep the parser isolated. |
| 3RD-08e | YouTube internal API | `youtube.com/youtubei/v1/search`, watch page, `suggestqueries-clients6.youtube.com` | `providers/chapters.ts:77,109`, `packages/utils/src/youtube.ts:21` | **Unofficial internal API.** May change without notice. Preserve the search-to-watch fallback in `chapters.ts`. |
| 3RD-08f | OpenAI-compatible LLM | `OPENAI_COMPATIBLE_API_URL` (default `http://127.0.0.1:8080/v1`, `apps/data-api/src/config/env.ts:10`) | Translation / AI batch providers, including `providers/translate.ts` | Assumes self-hosting; model and key are configured via environment variables. |
| 3RD-08g | Lavalink REST (search proxy) | `GET {LAVALINK_REST_URL}/v4/loadtracks` | `providers/lavalinkSearch.ts` | Depends on 3RD-03. Sends the node password verbatim in `Authorization`. |

Authentication conventions (raw HTTP `Authorization` header and Redis hub channels) are documented in [Shared Contracts, Section 5 of `architecture.md`](./architecture.md#5-공유-계약).

---

## 4. Upgrade Playbook

### A. Replacing Node Plugin JARs (3RD-01–04)

1. Verify that the target plugin's `plugin-api` and `lavaplayer` versions match the node's versions. 3RD-01 and 3RD-02 are built against `lavaplayer:2.2.6`.
2. If 3RD-03 is upgraded, **rebuild 3RD-02** because it depends on internal APIs.
3. When replacing 3RD-01, compare the REST contract in `api/openapi.yaml` with requests in `mixerService.ts`, especially the crossfade clamp (500–15,000 ms versus 500–30,000 ms).
4. After restarting, verify response schemas for `/mixer/state` and `/youtube-file-cache/stats`. The stats endpoint currently has the zero-counter bug; check only that the expected schema keys exist.
5. Compare deployment environment variables against the defaults hard-coded in code: `MIXER_CONFIRM_TIMEOUT_MS` and `MIXER_CALL_TIMEOUT_MS`.

### B. Upgrading `lavalink-client` (3RD-05)

1. Review `customPlayer.ts`, `queueStore.ts`, `trackHandler.ts`, and `sponsorBlockHandler.ts` first; they depend on internal APIs and event payloads.
2. Regression-test `autoSkip: false` behavior and the mixer-mediated skip sequence.
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
2. Every behavioral claim must include a `file-path:line` reference. Update references when lines move.
3. The sibling projects `../lavalink_mixer` and `../lavalink_file_cache` are authoritative. This document is a snapshot as of 2026-10-16. If a discrepancy is found, **the sibling-project code takes precedence** and this document must be corrected.
4. Add a **Fragile Rule** only when supported by an actual failure or a constraint enforced by code, ordering, or types. Label speculation as a hypothesis.
5. Do not include statistics or performance figures without a source. The current 3RD-02 stats endpoint's zero-value bug is the only explicitly documented exception.
