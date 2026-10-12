---
name: sapphire-command
description: >
  Create new Sapphire Framework slash commands for the SiruBOT Discord music bot.
  Use when adding, modifying, or reviewing chat input commands in apps/bot/src/modules/.
---

# Sapphire Command Skill

## Overview

SiruBOT uses `@sapphire/framework` v5 with `@sapphire/decorators`. Commands live in `apps/bot/src/modules/<module>/commands/`. Each module with commands (audio, general, games) has its own command directory — the voice module only has listeners.

## File Location

- Music commands: `apps/bot/src/modules/audio/commands/`
- General commands: `apps/bot/src/modules/general/commands/`
- Dev commands: `apps/bot/src/modules/general/commands/development/`
- Game commands: `apps/bot/src/modules/games/commands/` (the voice module has only `listeners/`, no commands)

## Command Structure

```ts
import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction } from 'discord.js';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'commandname',
	description: 'Korean description.',
	fullCategory: ['모듈명'] // e.g. ['음악'], ['일반'], ['개발'], ['게임']
	// preconditions: ['PreconditionName'] // if needed
})
export class CommandNameCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName('commandname')
				.setNameLocalizations({ ko: '한글명' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '한글 설명.' })
				// Add options here:
				.addStringOption((option) =>
					option
						.setName('query')
						.setNameLocalizations({ ko: '검색어' })
						.setDescription('English description.')
						.setDescriptionLocalizations({ ko: '한글 설명.' })
						.setRequired(true)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'commandname_not_in_guild',
				message: '❌ 길드 안에서만 사용할 수 있어요.',
				context: { ephemeral: true }
			});
		}

		await interaction.deferReply();
		// Command logic here
		await interaction.editReply({ content: 'Done!' });
	}
}
```

## Key Patterns

### Naming
- File name: `commandName.ts` (camelCase)
- Class name: `CommandNameCommand` (PascalCase + `Command` suffix)
- File class export is the default pattern
- `name` in options: lowercase, no spaces (used as slash command name)

### Subcommand Pattern (current main pattern)
Logic lives in `apps/bot/src/modules/audio/subcommands/*.ts` (or `modules/general/subcommands/*.ts`) modules exporting `name` / `ko` / `description` / `preconditions` / `build(sub)` / `run(interaction)`. The command keeps a `SUBCOMMANDS` array, registers each entry in `registerApplicationCommands`, and routes + runs each subcommand's preconditions itself via `PreconditionContainerArray` in `chatInputRun` — see `apps/bot/src/modules/audio/commands/music.ts:22-48,86-116` and the same pattern in `apps/bot/src/modules/general/commands/info.ts:9-72`. Add new subcommands as a module in `subcommands/` + one entry in the array; do not create a separate top-level command unless it stands alone.

### Localizations
- All commands use Korean (`ko`) as primary language
- English (`en-US`) as fallback
- Set both `setNameLocalizations` and `setDescriptionLocalizations`

### Preconditions
- Defined in the `preconditions` array in `@ApplyOptions`
- Resolved by Sapphire from the **file name** (piece name = file name without `.ts`), not the class name — e.g. `OwnerOnly.ts` exports `OwnerOnlyPrecondition` and `ManageGuild.ts` exports `ManageGuildPrecondition`, but they are referenced as `'OwnerOnly'` / `'ManageGuild'`
- Common audio preconditions: `TextChannelAllowed`, `NodeAvailable`, `VoiceConnected`, `SameVoiceChannel`, `MemberListenable`, `ClientVoiceConnectable`, `ClientVoiceSpeakable`
- Common general preconditions: `OwnerOnly`, `ManageGuild`

### Defer Reply
- Always `deferReply()` before async work
- Use `editReply()` for deferred responses
- Use `interaction.reply()` with `MessageFlags.Ephemeral` for quick error responses before deferring

### Error Handling
- Throw `UserError` with `identifier`, `message`, and `context: { ephemeral: true }` for user-facing errors
- The framework handles displaying these to the user

### Autocomplete
- Implement `autocompleteRun(interaction: AutocompleteInteraction)` override
- Return `interaction.respond([{ name, value }])` with max 25 choices
- Truncate names to 100 chars (Discord limit)

### Components V2
- Use `MessageFlags.IsComponentsV2` for modern Discord components
- Build with `ContainerBuilder`, `TextDisplayBuilder` from `discord.js`
- Use `@sirubot/utils` `DEFAULT_COLOR` for embed colors

## Services

Commands delegate business logic to services on `container` (declared in `apps/bot/src/types/global.d.ts`, registered in `core/botApplication.ts:90-113`):
- `this.container.audioService` — music playback operations
- `this.container.guildService` — guild settings (60s TTL cache)
- `this.container.trackService` — track metadata
- `this.container.playlistService` — playlist CRUD
- `this.container.mixerService` — Lavalink filters / gapless preload
- `this.container.tempVoiceService` — temp voice channels (create/delete/ownership/marker)
- `this.container.aiMemoryService` — AI long-term memory (Prisma only)
- `this.container.redisStore` — Redis queue/player/session stores (pendingWrites journal)
- `this.container.playerNotifier` — playback notifications (controller embed)
- `this.container.lavalinkHandler` — node/track handler registry (`cleanup()` runs at shutdown)
- `this.container.appEmojiManager` — app emoji cache
- `this.container.guildSettingsInvalidator` + other Redis subscribers — dashboard↔bot Redis wiring
- `this.container.audio` — LavalinkManager instance

## Available from `@sirubot/utils`

- `DEFAULT_COLOR` — default embed color constant
- `emoji(name)` / `emoji(name, fallback)` — app emoji rendering (`packages/utils/src/appEmoji.ts`) — most used for message strings
- `createContainer()` — Components V2 `ContainerBuilder` helper (`packages/utils/src/embed.ts`)
- `pickRandom(array)` — random item from array
- `formatTime(seconds: number)` — formats a **seconds** value to `MM:SS`/`HH:MM:SS` (`packages/utils/src/time.ts:1-13` — seconds, not milliseconds)
- `getSimpleYouTubeSuggestions(query)` — YouTube autocomplete

## Build

- TypeScript with `tsup` (shared config from `scripts/tsup.config.ts`)
- Extends `tsconfig.base.json` from monorepo root
- ESM modules (`"type": "module"` in package.json)
