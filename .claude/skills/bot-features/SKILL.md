---
name: bot-features
description: Build or modify AI chat (chat/aiTools/memory), TTS/mixer/lyrics/recommendation, temp voice channels, and games commands for SiruBOT.
---

# Bot Features (AI, voice, games)

## AI chat
- Pipeline: mention trigger `features/ai-chat/discord/listeners/mentionReply.ts` (settings via `discord/commands/chatSettings.ts`, `chatTools.ts`; stop button `discord/interaction-handlers/chatCancel.ts`; custom IDs `discord/customIds.ts`) → `features/ai-chat/application/aiChatService.ts` → `features/ai-chat/application/aiTools/` (tool list in `createAiTools(deps)`, `aiTools/index.ts`; entry points `container.aiChat`): web_search, web_fetch, weather_get, delivery_track, get_ohaasa_horoscope, bot_help, server_info, music_* (`music.ts`; control tools call `deps.getMusic()`, which is `container.music`; helper checks and filters go through `deps.musicPort`, the `MusicToolPort` from `features/music/application/musicToolPort.ts`, built by `createMusicToolPort`), music_settings_get/set, bot_settings_get/set, memory_save/memory_forget.
- `features/ai-chat/application/aiMemoryService.ts`: per-user long-term memory — Prisma only (`deps.db.userMemory`), no Redis. New tools: add a factory that takes `Pick<AiToolDeps, ...>` (`aiTools/deps.ts`), register it in `createAiTools` and follow the `types.ts` interface contract; never import `container` in a tool.

## Audio extras
- `mixerService.ts` + `features/music/discord/commands/mixer.ts`, `commands/favorites.ts`, subcommands `subcommands/{lyrics,recommend}.ts` (registered in the `SUBCOMMANDS` array of `commands/music.ts`). TTS (feature `features/tts/`): `discord/commands/tts.ts` + `application/ttsService.ts`, panel handlers `discord/interaction-handlers/ttsPanel{Button,Select}.ts`, chat-to-speech listener `discord/listeners/chatTts.ts`, member announce `discord/listeners/ttsMemberAnnounce.ts`, queue-side logic `application/chatTts.ts`.
- Autoplay is NOT a command: `features/music/discord/views/related.ts` + `lavalink/autoPlayRelated.ts` — there is no related.ts command file.
- Lavalink filters/playback internals belong to bot-ops; here only cover pipeline impact of these features.

## Temp voice channels
- Core: `features/temp-voice/application/tempVoiceService.ts` (create/delete, ownership, settings; deps incl. `emptyGraceMs` come from `setupServices`, the marker-channel failure notice is rendered by `features/temp-voice/discord/tempVoiceMessages.ts`). Listeners: `features/temp-voice/discord/listeners/tempVoiceState.ts` (VoiceState → delegates to service), `tempVoiceChannelDelete.ts` (delete cleanup).
- JTC marker: interaction (`features/music/discord/interaction-handlers/settings.ts`) → `tempVoiceService.setupMarkerChannel`; dashboard path goes through Redis-wired `features/temp-voice/inbound/jtcSetup.ts`. If a channel isn't deleted, trace the service lifecycle methods first; consider leaks/orphan channels.

## Games
- `features/games/discord/commands/`: dice, rps, ohaasa, guess, checkin. Single interaction handler `features/games/discord/interaction-handlers/games.ts` — customIds declared in `features/games/discord/customIds.ts` (`game:v1:<action>[:<field>]`); new games add actions there. Ohaasa: zodiac mapping in `features/games/application/ohaasaService.ts`; translated horoscope data comes from data-api `/v1/ohaasa` (`services/dataApiClient.ts`).
- State: streaks/records/checkin persist via `features/games/application/gameRecords.ts` (`container.gameRecords`) in Prisma (`gameRecord`/`user`) — survive restarts. Only in-progress rounds live in customIds and are lost (no games resume after restart, by design).

## Conventions
- `.ts` extension relative imports, `ko` locale, user errors via `UserError` (see sapphire-command skill). Reuse existing retry/timeout/error patterns for external APIs (weather, delivery, YouTube, lyrics); never expose API keys.

Answer style: state external API deps (provider, key env var) and failure behavior (silent fail vs user notice) first. Trace command → service → tool → response; show state flow (create → use → cleanup).