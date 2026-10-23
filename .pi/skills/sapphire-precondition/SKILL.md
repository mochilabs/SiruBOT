---
name: sapphire-precondition
description: >
  Create new Sapphire Framework preconditions for the SiruBOT Discord music bot.
  Use when adding permission checks, voice state validations, or any command guard logic.
---

# Sapphire Precondition Skill

## Overview

Preconditions are guards that run before a command executes. They determine whether a user is allowed to use a command. SiruBOT uses `AllFlowsPrecondition` from `@sapphire/framework` which supports all interaction types (chat input, context menu, message).

## File Location

- Audio preconditions: `apps/bot/src/modules/audio/preconditions/`
- General preconditions: `apps/bot/src/modules/general/preconditions/`

## Precondition Structure

```ts
import { AllFlowsPrecondition } from '@sapphire/framework';
import type { CommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';

export class PreconditionName extends AllFlowsPrecondition {
	// getter — 클래스 필드로 초기화하면 앱 이모지 매핑 로드 전에 평가된다 (VoiceConnected.ts:7-9 관례)
	get #message() {
		return '🚫  Korean error message shown to user.';
	}
	#ephemeral = true; // whether error is ephemeral

	public override chatInputRun(interaction: CommandInteraction) {
		// Check logic for slash commands
		return condition ? this.ok() : this.createError();
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return condition ? this.ok() : this.createError();
	}

	public override messageRun(message: Message) {
		return condition ? this.ok() : this.createError();
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
```

Notes:
- Every precondition with a message field uses the `get #message()` getter pattern (10 of 11 existing files; `TextChannelAllowed` builds its messages inline). `createError()` is likewise a private method redefined per class (`NodeAvailable.ts:27-29`) — or omitted when the class calls `this.error(...)` directly (e.g. `OwnerOnly` with `silent: true`).

## Key Patterns

### Naming
- File name: `PreconditionName.ts` (PascalCase)
- Sapphire resolves the `preconditions` array by the **piece name = file name** (without `.ts`), not the class name — counter-examples: `OwnerOnly.ts` exports `OwnerOnlyPrecondition`, `ManageGuild.ts` exports `ManageGuildPrecondition`, yet both are referenced as `'OwnerOnly'` / `'ManageGuild'`
- Sapphire auto-resolves from the `preconditions` array in command options

### Return Values
- `this.ok()` — precondition passed, command continues
- `this.error({ message, context })` — precondition failed, command blocked
- `context.ephemeral: true` — error shown only to the user
- `context.silent: true` — error not shown (for owner-only, etc.)

### Flow Methods
Every `AllFlowsPrecondition` must implement these three methods:
- `chatInputRun(interaction: CommandInteraction)` — slash commands
- `contextMenuRun(interaction: ContextMenuCommandInteraction)` — context menus
- `messageRun(message: Message)` — prefix messages (if enabled)

### Common Guard Checks

**Guild only:**
```ts
if (!interaction.inCachedGuild()) return this.createError();
```

**Voice channel check:**
```ts
if (!interaction.member.voice.channelId) return this.createError();
```

**Bot permissions:**
```ts
const channel = interaction.member.voice.channel;
if (!channel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.Connect)) {
	return this.createError();
}
```

**Database lookup (async):**
```ts
public override async chatInputRun(interaction: CommandInteraction) {
	if (!interaction.inCachedGuild()) return this.createError();
	return this.checkChannel(interaction.guildId, interaction.channelId);
}

private async checkChannel(guildId: string | null, channelId: string | null) {
	const settings = await this.container.db.guild.findUnique({
		where: { id: guildId! },
		select: { textChannelId: true }
	});
	// ... check logic
	return this.ok();
}
```

Note: this example is valid TypeScript, but the real `TextChannelAllowed` does not query Prisma directly — it reuses `this.container.guildService.getDefaultTextChannel(guildId)` (guildService's 60-second TTL cache) to avoid a DB hit per command (`TextChannelAllowed.ts:20-21`).

**Environment variable check:**
```ts
import { envParseArray } from '@skyra/env-utilities';
const OWNERS = envParseArray('OWNERS');

public check(userId: Snowflake) {
	return OWNERS.includes(userId) ? this.ok() : this.error({ message: this.#message, context: { silent: true } });
}
```

## Existing Preconditions (Audio Module)

| Precondition | Purpose |
|---|---|
| `TextChannelAllowed` | Enforces guild's configured text channel |
| `NodeAvailable` | At least one Lavalink node is connected |
| `VoiceConnected` | User is in a voice channel |
| `SameVoiceChannel` | User is in the same voice channel as the bot |
| `MemberListenable` | User is not deafened in voice |
| `ClientVoiceConnectable` | Bot has Connect permission in the channel |
| `ClientVoiceSpeakable` | Bot has Speak permission in the channel |
| `DJOrAlone` | User has DJ role or is alone in channel |
| `SongPlaying` | A song is currently playing |

## Existing Preconditions (General Module)

| Precondition | Purpose |
|---|---|
| `OwnerOnly` | User ID is in `OWNERS` env array |
| `ManageGuild` | User has ManageGuild permission |

## Attaching to Commands

**Main real-world path — subcommand-level `export const preconditions`:** most music commands route through `music.ts`, which runs each subcommand's own array via `PreconditionContainerArray` (`music.ts:107-115`). The subcommand module exports it directly, e.g. `modules/audio/subcommands/play.ts:10-18`:

```ts
export const preconditions = [
	'TextChannelAllowed',
	'NodeAvailable',
	'VoiceConnected',
	'SameVoiceChannel',
	'MemberListenable',
	'ClientVoiceConnectable',
	'ClientVoiceSpeakable'
];
```

**Command-level `preconditions` in `@ApplyOptions<Command.Options>`** — used by some commands only (e.g. `audio/commands/mixer.ts:13`, `queue.ts:15`, `playlist.ts`, `favorites.ts`, `nowplaying.ts`):

```ts
preconditions: [
	'TextChannelAllowed',
	'NodeAvailable',
	'VoiceConnected',
	'SameVoiceChannel'
]
```

Preconditions run in order. If any fails, the command is blocked.

## Container Access

Preconditions can access:
- `this.container.db` — PrismaClient
- `this.container.audio` — LavalinkManager
- `this.container.client` — Discord Client
- `this.container.logger` — tslog Logger
- `this.container.redisStore` — Redis session store
