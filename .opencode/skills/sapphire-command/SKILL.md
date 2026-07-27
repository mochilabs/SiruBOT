---
name: sapphire-command
description: >
  Create new Sapphire Framework slash commands for the SiruBOT Discord music bot.
  Use when adding, modifying, or reviewing chat input commands in apps/bot/src/modules/.
---

# Sapphire Command Skill

## Overview

SiruBOT uses `@sapphire/framework` v5 with `@sapphire/decorators`. Commands live in `apps/bot/src/modules/<module>/commands/`. Each module (audio, general) has its own command directory.

## File Location

- Music commands: `apps/bot/src/modules/audio/commands/`
- General commands: `apps/bot/src/modules/general/commands/`
- Dev commands: `apps/bot/src/modules/general/commands/development/`

## Command Structure

```ts
import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction } from 'discord.js';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'commandname',
	description: 'Korean description.',
	fullCategory: ['모듈명'] // e.g. ['음악'], ['일반'], ['개발']
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

### Localizations
- All commands use Korean (`ko`) as primary language
- English (`en-US`) as fallback
- Set both `setNameLocalizations` and `setDescriptionLocalizations`

### Preconditions
- Defined in the `preconditions` array in `@ApplyOptions`
- Resolved by Sapphire from the class name (file name without `.ts`)
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

Commands delegate business logic to services on `container`:
- `this.container.audioService` — music playback operations
- `this.container.guildService` — guild settings
- `this.container.trackService` — track metadata
- `this.container.playlistService` — playlist CRUD
- `this.container.audio` — LavalinkManager instance

## Available from `@sirubot/utils`

- `DEFAULT_COLOR` — default embed color constant
- `pickRandom(array)` — random item from array
- `formatTime(ms)` — format milliseconds to readable time
- `getSimpleYouTubeSuggestions(query)` — YouTube autocomplete

## Build

- TypeScript with `tsup` (shared config from `scripts/tsup.config.js`)
- Extends `tsconfig.base.json` from monorepo root
- ESM modules (`"type": "module"` in package.json)
