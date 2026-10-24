---
name: bot-ops
description: Debug SiruBOT audio playback faults, Lavalink node failover, queue/session loss, sharding allocation failures, health-check 503s, and shutdown-order issues.
---

# Bot Ops (audio, state, sharding)

Audio runs on `lavalink-client` v2 with external Lavalink servers. NEVER suggest `@discordjs/voice`, yt-dlp, or play-dl — none exist here.
Triage by layer first: voice/playback pipeline ↔ Redis/DB state ↔ sharding.

## Audio pipeline
1. `setupAudio(nodes, shardInfo)` (`core/botApplication.ts`, called at bootstrap.ts:214) options: retryAmount/retryDelay, autoSkip, onEmptyQueue destroyAfterMs + `autoPlayRelated`, maxErrorsPerTime, sendToShard.
2. Handlers in `modules/audio/lavalink/handlers/` (6 files): `trackHandler` (trackStart/trackEnd/trackStuck/trackError/queueEnd/playerDestroy; stops after `consecutiveErrors >= MAX_CONSECUTIVE_ERRORS`, env-overridable); `nodeHandler` (on connect: updateSession + store session; on disconnect: redistributes orphan players round-robin to `leastUsedNodes('playingPlayers')` — zero-node guard exists, do NOT change this logic out of error concerns); `playerHandler`, `base.ts`, `lavalinkHandler` (`cleanup()` at shutdown).
3. `AudioService` (`services/audioService.ts`) flow: getOrCreatePlayer → connectPlayer (permissions) → search (loadType error/empty) → handleTrackPlay/PlaylistPlay → ensurePlayback — narrow failures to a step.
4. Voice connection issues: `modules/audio/listeners/raw.ts` (voice payload → Lavalink), `voiceStateUpdate.ts` (5-minute empty-channel leave, deaf filter).

## State persistence (Redis queues/sessions | Prisma)
5. Queue: `CachedQueueStore` in `queue/queueStore.ts` — Redis first → MemoryCache (TTL 30 min, max 1000) → empty queue. On Redis disconnect, pendingWrites accumulate and sync onConnect. Redis key TTL 7 days (`REDIS_TTL_SECONDS`), key `lavalink/queue/<guildId>`. For loss reports, narrow to pendingWrites miss / TTL expiry / key mismatch.
6. Session resume: `NodeSessionStore` in `redisStore.ts` (sessionId per shard key). `handleNodeResumed` (`nodeHandler.ts:95-165`): filters unconnected and 5-min-stale players, then batch (10) parallel restore; guilds whose cache hasn't arrived go to `pendingGuildPlayers`, polled for 90 s (`GUILD_WAIT_TIMEOUT_MS`) then restored/cleaned. Restore order: savedPlayer lookup → createPlayer → controller fetch → queue sync → assign current/position. Fresh-session ops on `resumed===false`: `restoreFreshSession/restoreFreshGuild/restoreFreshPlayer` (`nodeHandler.ts:75-93,296-451`) with 6 h freshness (`FRESH_RESTORE_MAX_AGE_MS`) and empty-voice-channel occupancy check.
7. PlayerSaver: set on playerCreate/Update, delete on playerDestroy — check delete-before-save races. Prisma (`packages/prisma/src/schema.prisma`): `PlaylistTrack @@unique([playlistId, position])` reorder races, `GuildTrackHistory` index, onDelete propagation. `trackStart`'s increasePlays→addHistory is fire-and-forget (logger.error only) — candidate cause for missing stats.

## Sharding
8. Boot branch (`core/bootstrap.ts`): `NODE_ENV !== 'production'` → standalone shard `[0]`. Production requires `SHARD_MANAGER_URL`; on `NoShardsAvailableError`, infinite retry with `SHARD_IDENTIFY_RETRY_MS` (min 1000 ms) — slot contention during rolling updates is normal, do not "fix" with exit logic.
9. Status: `reportStatus('ready')` + `onStats` (guild count, player count, heap, uptime). For dashboard/shardmanager count mismatches, check this callback first. 5 shard listeners (`modules/general/listeners/shard/`): disconnect, Error, Ready, Reconnecting, Resume.
10. Health: `HEALTH_PORT` (default 8080) HTTP 200/503 based on `client.isReady()` — 503 only before READY; temporary reconnects after READY get 200 for a 120 s grace. `wsStatus` is included in body but not used for the verdict. A 503 may be a Discord WS issue, not Lavalink — separate causes.

## Shutdown order (`core/bootstrap.ts`) — violations lose sessions; flag in review
healthServer close → Lavalink node session Redis save → `lavalinkHandler.cleanup()` + `audio.removeAllListeners()` → stop 6 Redis subscription services (guildSettingsInvalidator, playerWebResponder, jtcSetupResponder, botProfileService, memberGreetingService, guildDataResponder) → pendingWrites journal flush → redis disconnect → db disconnect → `client.destroy()` → `shardClient.destroy()` → `Sentry.close(2000)`.

Answer style: no guessing. Pinpoint the failing step from logs/events/config; give confirmation logs and repro conditions (dev/prod, shard count, node count) per hypothesis. Minimal-diff fixes. Trace data flow (write → read → restore); state race/TTL assumptions explicitly. Schema changes: mention `yarn workspace @sirubot/prisma migrate:dev`.