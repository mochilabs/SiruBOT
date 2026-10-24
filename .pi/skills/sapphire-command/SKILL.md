---
name: sapphire-command
description: Author Sapphire Framework slash commands and preconditions (guards) for the SiruBOT Discord music bot.
---

# Sapphire Commands & Preconditions

## Commands

- Locations: `apps/bot/src/modules/<module>/commands/` — audio, general (`development/` for dev), games. Voice module has only `listeners/`, no commands.
- File `commandName.ts` (camelCase), class `CommandNameCommand`, `name` lowercase no spaces.
- Stack: `@sapphire/framework` v5 + `@sapphire/decorators`; services registered in `core/botApplication.ts:90-113`, typed in `apps/bot/src/types/global.d.ts`.

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
Subcommand logic lives in `apps/bot/src/modules/audio/subcommands/*.ts` (or `modules/general/subcommands/*.ts`), exporting `name` / `ko` / `description` / `preconditions` / `build(sub)` / `run(interaction)`. Command keeps a `SUBCOMMANDS` array, registers each entry in `registerApplicationCommands`, and routes + runs each subcommand's preconditions itself via `PreconditionContainerArray` in `chatInputRun` — see `modules/audio/commands/music.ts:22-48,86-116` and `modules/general/commands/info.ts:9-72`. Add new subcommands as a `subcommands/` module + one array entry; don't create a separate top-level command unless it stands alone.

### Container services
`audioService` (playback), `guildService` (settings, 60s TTL cache), `trackService`, `playlistService`, `mixerService` (Lavalink filters/gapless preload), `tempVoiceService` (create/delete/ownership/marker), `aiMemoryService` (Prisma only), `redisStore` (queue/player/session stores, pendingWrites journal), `playerNotifier` (controller embed), `lavalinkHandler` (node/track handler registry, `cleanup()` at shutdown), `appEmojiManager`, `guildSettingsInvalidator` + Redis subscribers, `audio` (LavalinkManager).

### `@sirubot/utils`
`DEFAULT_COLOR`; `emoji(name, fallback?)` (app emoji, `packages/utils/src/appEmoji.ts`); `createContainer()` (`packages/utils/src/embed.ts`); `pickRandom(array)`; `formatTime(seconds)` — seconds, not ms (`packages/utils/src/time.ts:1-13`); `getSimpleYouTubeSuggestions(query)`.

Build: TypeScript + tsup (`scripts/tsup.config.ts`), extends root `tsconfig.base.json`, ESM.

## Preconditions

- Locations: `apps/bot/src/modules/audio/preconditions/`, `apps/bot/src/modules/general/preconditions/`.
- Extend `AllFlowsPrecondition` (works for chat input, context menu, message). Must implement `chatInputRun(interaction)`, `contextMenuRun(interaction)`, `messageRun(message)`.
- Return `this.ok()` or `this.error({ message, context })`; `context.ephemeral: true` = show only to user; `context.silent: true` = don't show (e.g. OwnerOnly).
- File `PreconditionName.ts` (PascalCase). Sapphire resolves by **piece name = file name** (without `.ts`), not class name: `OwnerOnly.ts` exports `OwnerOnlyPrecondition`, `ManageGuild.ts` exports `ManageGuildPrecondition`, yet referenced as `'OwnerOnly'` / `'ManageGuild'`.
- Use `get #message()` getter for the message (class field would evaluate before app emoji mapping loads; convention from `VoiceConnected.ts:7-9`); `TextChannelAllowed` builds messages inline instead. Private `createError()` helper per class (`NodeAvailable.ts:27-29`); omit if calling `this.error(...)` directly.
- Container access: `db` (PrismaClient), `audio` (LavalinkManager), `client`, `logger`, `redisStore`.
- Reuse `guildService.getDefaultTextChannel(guildId)` (60s TTL cache) instead of hitting Prisma per command (`TextChannelAllowed.ts:20-21`).
- Env check: `envParseArray('OWNERS')` from `@skyra/env-utilities`.
- Voice checks: `interaction.member.voice.channelId`; bot perms via `channel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.Connect)`.

### Existing preconditions
Audio: `TextChannelAllowed` (guild's configured text channel), `NodeAvailable` (≥1 Lavalink node connected), `VoiceConnected` (user in voice), `SameVoiceChannel`, `MemberListenable` (user not deafened), `ClientVoiceConnectable` (bot Connect perm), `ClientVoiceSpeakable` (bot Speak perm), `DJOrAlone`, `SongPlaying`.
General: `OwnerOnly` (OWNERS env), `ManageGuild`.

### Attaching — order is a fragile contract, run in array order
Common audio chain, in order:
`TextChannelAllowed, NodeAvailable, VoiceConnected, SameVoiceChannel, MemberListenable, ClientVoiceConnectable, ClientVoiceSpeakable`
- Subcommand-level `export const preconditions` (main path; `music.ts:107-115` runs each via `PreconditionContainerArray`, e.g. `subcommands/play.ts:10-18`).
- Command-level `preconditions` in `@ApplyOptions` — some commands only (`mixer.ts:13`, `queue.ts:15`, `playlist.ts`, `favorites.ts`, `nowplaying.ts`), often the shorter chain `TextChannelAllowed, NodeAvailable, VoiceConnected, SameVoiceChannel`.
If any fails, the command is blocked.