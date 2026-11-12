---
name: sapphire-command
description: Author Sapphire Framework slash commands and preconditions (guards) for the SiruBOT Discord music bot.
---

# Sapphire Commands & Preconditions

## Commands

- Locations: `apps/bot/src/modules/general/commands/` (`development/` for dev), `features/<name>/discord/commands/` (music, games, ...). Temp voice (`features/temp-voice`) has only listeners, no commands.
- File `commandName.ts` (camelCase), class `CommandNameCommand`, `name` lowercase no spaces.
- Stack: `@sapphire/framework` v5 + `@sapphire/decorators`; services registered in `core/botApplication.ts` (`setupServices()`), typed in `apps/bot/src/types/global.d.ts`.

### Template

```ts
@ApplyOptions<Command.Options>({
	name: 'commandname',
	description: 'Description.',
	fullCategory: ['audio'] // or 'general', 'development', 'games'
	// preconditions: ['OwnerOnly']
})
export class CommandNameCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName('commandname')
				.setNameLocalizations({ ko: '...' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ 'en-US': '...', ko: '...' })
				.addStringOption((o) => o.setName('query').setRequired(true))
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({ identifier: 'commandname_not_in_guild', message: '...', context: { ephemeral: true } });
		}
		await interaction.deferReply();
		await interaction.editReply({ content: 'Done!' });
	}
}
```

### Rules
- Always `deferReply()` before async work; `editReply()` for deferred replies. Quick pre-defer errors: `interaction.reply()` with `MessageFlags.Ephemeral`.
- User-facing errors: `throw new UserError({ identifier, message, context: { ephemeral: true } })`.
- Localizations: `ko` primary, `en-US` fallback; set both name and description localizations.
- Autocomplete: `autocompleteRun(interaction)` → `interaction.respond([{ name, value }])`, max 25 choices, names ≤100 chars.
- Components V2: `MessageFlags.IsComponentsV2`, `ContainerBuilder`/`TextDisplayBuilder`, `DEFAULT_COLOR` from `@sirubot/utils` (see component-view skill).

### Subcommand pattern (main pattern)
Subcommand logic lives in `apps/bot/src/features/music/discord/subcommands/*.ts` (or `modules/general/subcommands/*.ts`), exporting `name` / `ko` / `description` / `preconditions` / `build(sub)` / `run(interaction)`. Command keeps a `SUBCOMMANDS` array, registers each entry in `registerApplicationCommands`, and routes + runs each subcommand's preconditions via `runSubcommandPreconditions` (`lib/subcommandDispatcher.ts`, wraps `PreconditionContainerArray`) in `chatInputRun` — see `features/music/discord/commands/music.ts` and `modules/general/commands/info.ts`. The `/음악` summary used by `/도움말` (`MUSIC_SUBCOMMANDS`, `MUSIC_PROMOTED_COMMANDS`) is plain data in `features/music/discord/commandCatalog.ts`, pinned to the subcommand modules by `commandCatalog.test.ts`; keep it in sync when a subcommand changes. Add new subcommands as a `subcommands/` module + one array entry; don't create a separate top-level command unless it stands alone.

### Container services
`audioService` (playback), `guildService` (settings, 60s TTL cache), `trackService`, `playlistService`, `mixerService` (Lavalink filters/gapless preload), `tempVoiceService` (create/delete/ownership/marker, `features/temp-voice/application/`), `aiMemoryService` (Prisma only, `features/ai-chat/application/`), `aiChat` (AI chat entry points, `features/ai-chat/application/`), `ttsService`/`chatTtsService`/`ttsUserSettings`/`ttsPronunciation` (`features/tts/application/`), `dataApi` (data-api image rendering and uploads), `webhookRelay`, `music` (playback control use cases, `features/music/application/`), `ticketService`/`rolePanelService`/`gameRecords`/`customCommandStore`/`customSlashRegistry`/`memberGreetingService` (feature application services built with deps in `setupServices`), `redisStore` (queue/player/session stores, pendingWrites journal), `playerNotifier` (controller embed), `lavalinkHandler` (node/track handler registry, `cleanup()` at shutdown), `appEmojiManager`, the shared Redis subscription (`container.redisSubscribers`; responders and listeners under `features/*/inbound/`), `audio` (LavalinkManager).

### `@sirubot/utils`
`DEFAULT_COLOR`; `emoji(name, fallback?)` (app emoji, `packages/utils/src/appEmoji.ts`); `createContainer()` (`packages/utils/src/embed.ts`); `pickRandom(array)`; `formatTime(seconds)` — seconds, not ms (`packages/utils/src/time.ts`); `getSimpleYouTubeSuggestions(query)`.

Build: TypeScript + tsup (`scripts/tsup.config.ts`), extends root `tsconfig.base.json`, ESM.

## Preconditions

- Locations: `apps/bot/src/features/music/discord/preconditions/`, `apps/bot/src/modules/general/preconditions/`. Piece roots are listed in `PIECE_ROOTS` (`core/pieceRoots.ts`); new pieces for a feature go under `features/<name>/discord/{commands,listeners,interaction-handlers}`, and a new piece name must be unique per store (`core/pieceInventory.test.ts` snapshots every piece). Interaction handlers claim an ID by calling `decode` from the owning module's `defineCustomId` declaration in `parse()` (`this.some(...)` on a match, `this.none()` otherwise); see `component-view` for the format.
- Music control policy (same voice channel, DJ or alone) lives once in `features/music/application/access.ts`; the `SameVoiceChannel`/`DJOrAlone` preconditions only gate slash entry. User-facing failures inside use cases are `AppError`, not `UserError`.
- Extend `AllFlowsPrecondition` (works for chat input, context menu, message). Must implement `chatInputRun(interaction)`, `contextMenuRun(interaction)`, `messageRun(message)`.
- Return `this.ok()` or `this.error({ message, context })`; `context.ephemeral: true` = show only to user; `context.silent: true` = don't show (e.g. OwnerOnly).
- File `PreconditionName.ts` (PascalCase). Sapphire resolves by **piece name = file name** (without `.ts`), not class name: `OwnerOnly.ts` exports `OwnerOnlyPrecondition`, `ManageGuild.ts` exports `ManageGuildPrecondition`, yet referenced as `'OwnerOnly'` / `'ManageGuild'`.
- Use `get #message()` getter for the message (class field would evaluate before app emoji mapping loads; convention from `VoiceConnected.ts`); `TextChannelAllowed` builds messages inline instead. Private `createError()` helper per class (`NodeAvailable.ts`); omit if calling `this.error(...)` directly.
- Container access: `db` (PrismaClient), `audio` (LavalinkManager), `client`, `logger`, `redisStore`.
- Reuse `guildService.getDefaultTextChannel(guildId)` (60s TTL cache) instead of hitting Prisma per command (see `TextChannelAllowed.ts`).
- Owner check: `isOwner(userId)` from `lib/owners.ts` (reads `getConfig().discord.owners`). Never read `process.env` or call `envParse*` in a piece; use `getConfig()` from `lib/config.ts`.
- Voice checks: `interaction.member.voice.channelId`; bot perms via `channel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.Connect)`.

### Existing preconditions
Audio: `TextChannelAllowed` (guild's configured text channel), `NodeAvailable` (≥1 Lavalink node connected), `VoiceConnected` (user in voice), `SameVoiceChannel`, `MemberListenable` (user not deafened), `DJOrAlone`, `SongPlaying`.
General: `OwnerOnly` (OWNERS env), `ManageGuild`.

### Attaching — order is a fragile contract, run in array order
Common audio chain, in order:
`TextChannelAllowed, NodeAvailable, VoiceConnected, SameVoiceChannel, MemberListenable`
- Subcommand-level `export const preconditions` (main path; `music.ts` `chatInputRun` runs each via `runSubcommandPreconditions`, e.g. `subcommands/play.ts`).
- Command-level `preconditions` in `@ApplyOptions` — few commands: `queue.ts`/`mixer.ts` (`TextChannelAllowed`), `nowplaying.ts` (`TextChannelAllowed, NodeAvailable, SongPlaying`).
If any fails, the command is blocked.