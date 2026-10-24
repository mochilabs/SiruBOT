---
name: bot-features
description: Build or modify AI chat (chat/aiTools/memory), TTS/mixer/lyrics/recommendation, temp voice channels, and games commands for SiruBOT.
---

# Bot Features (AI, voice, games)

## AI chat
- Pipeline: `modules/general/commands/chat.ts` + `chatSettings.ts` → `services/aiChatService.ts` → `services/aiTools/` (25 registered tools, `aiTools/index.ts:11`): web_search, web_fetch, weather_get, delivery_track, bot_help, get_ohaasa_horoscope, 17 music_* tools (`aiTools/music.ts:553-571`), memory_save/memory_forget (`aiTools/memory.ts:57`).
- `services/aiMemoryService.ts`: per-user long-term memory — Prisma only (`container.db.userMemory`), no Redis. New tools: register in `aiTools/index.ts` and follow the `types.ts` interface contract.

## Audio extras
- `mixerService.ts` + `modules/audio/commands/mixer.ts`, `commands/favorites.ts`, subcommands `subcommands/{tts,lyrics,recommend}.ts` (registered in the music.ts SUBCOMMANDS array, `commands/music.ts:32-48`).
- Autoplay is NOT a command: `modules/audio/view/related.ts` + `lavalink/autoPlayRelated.ts` — there is no related.ts command file.
- Lavalink filters/playback internals belong to bot-ops; here only cover pipeline impact of these features.

## Temp voice channels
- Core: `services/tempVoiceService.ts` (create/delete, ownership, settings). Listeners: `modules/voice/listeners/tempVoiceState.ts` (VoiceState → delegates to service), `tempVoiceChannelDelete.ts` (delete cleanup).
- JTC marker: interaction (`modules/audio/interaction-handlers/settings.ts:178`) → `tempVoiceService.setupMarkerChannel`; dashboard path goes through Redis-wired `services/jtcSetupResponder.ts`. If a channel isn't deleted, trace the service lifecycle methods first; consider leaks/orphan channels.

## Games
- `modules/games/commands/`: dice, rps, fortune, ohaasa, guess, checkin (6 total). Single interaction handler `modules/games/interaction-handlers/games.ts` — customId `game:<type>:<args>` convention (`games.ts:70,75`); new games use this pattern. See `games/utils/ohaasaService.ts`, `services/ohaasaTranslate.ts`.
- State: streaks/records/checkin persist via `games/utils/gameRecords.ts` in Prisma (`gameRecord`/`user`) — survive restarts. Only in-progress rounds live in customIds and are lost (no games resume after restart, by design).

## Conventions
- `.ts` extension relative imports, `ko` locale, user errors via `UserError` (see sapphire-command skill). Reuse existing retry/timeout/error patterns for external APIs (weather, delivery, YouTube, lyrics); never expose API keys.

Answer style: state external API deps (provider, key env var) and failure behavior (silent fail vs user notice) first. Trace command → service → tool → response; show state flow (create → use → cleanup).