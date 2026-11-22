# Feature guidelines

> **As of**: 2026-11-22, against `origin/beta`.
> Scope: when a new bot feature is worth adding, and how to keep the slash command list inside Discord's limits.
> Only rules that the code enforces or that Discord documents are written here. Anything else is marked as a proposal.

## 1. Slash command budget

### 1.1 Discord limits

Source: Discord developer docs, "Application Commands" page (`https://docs.discord.com/developers/interactions/application-commands`; the older `discord.com/developers/docs/...` URL redirects there), read on 2026-11-22.

| Limit | Value | Docs section |
|---|---|---|
| Global `CHAT_INPUT` (slash) commands per app | 100 | Registering a Command |
| Global user commands / message commands per app | 15 each | Registering a Command |
| Guild commands per guild | Same counts as global, counted separately from global | Registering a Command |
| Command creates per day | 200 per day, counted per guild | Registering a Command (caution note) |
| Options per command, and per subcommand or group | 25 | Application Command Object |
| Choices per option | 25 | Application Command Option Structure |
| Subcommand nesting | One level of group (command, group, subcommand) | Subcommands and Subcommand Groups |
| Command and option name | 1-32 characters; description 1-100 | Application Command Object |
| Total size of one slash command | 8000 characters across names, descriptions and values of the command, its options, subcommands, groups and choices; with localizations, only the longest variant of each field counts | Slash Commands (warning) |

Not verified here: the current 8000-character size of each existing command (nobody has measured it; `scripts/register-commands.ts --dry-run` only diffs names). The fetched page was summarized by a tool, so re-check the numbers on the page before relying on a limit that is close to being hit.

### 1.2 How this repo registers commands

- Every command is a Sapphire command piece that calls `registerApplicationCommands`. Commands under `apps/bot/src/discord/commands/development/` pass `guildIds: devGuildIds` and are registered only in the dev guilds, so they do not count against the global 100.
- The bot registers no user or message context-menu commands (no `registerContextMenuCommand` call exists in `apps/bot/src` except the script's no-op mock in `scripts/register-commands.ts`).
- The authoritative list of command pieces is the snapshot `EXPECTED_COMMAND_CATEGORIES` in `apps/bot/src/core/pieceInventory.test.ts`. A new command fails that test until the snapshot is updated, so the count cannot drift silently.
- `packages/utils/src/modules.ts` (`BOT_MODULES`) lists the public commands by module. `apps/bot/src/discord/help/helpCatalog.test.ts` requires every public command piece to be in a module, and every listed command to be a real piece. `packages/utils/src/modules.test.ts` requires each command to belong to only one module.

### 1.3 Current count

Counted from the command pieces and `BOT_MODULES` on current `origin/beta`: **37 command pieces, 6 of them dev-only, so 31 global slash commands**. That is 31% of the 100 limit, with 69 slots free. Two PRs merged or opened since then each add one top-level command: `announce` (scheduled messages, 3 subcommands) and `giveaway` (4 subcommands: start, reroll, end, cancel). That makes **33 global commands (67 free)**, or 30 once the `/설정` consolidation removes three. The birthday PR adds no top-level command: it adds the `/프로필 생일축하` subcommand to `profile`.

The count is for current beta. When the `/설정` consolidation PR merges, `mixer`, `chat-settings` and `chattools` are deleted and their features move into `settings`, so the global count drops by 3 to 28 (72 free) and the admin row below becomes 2 commands. Re-count before relying on these numbers.

| Module (`BOT_MODULES`) | Commands now | Count | Subcommands (sum) |
|---|---|---|---|
| `music` | `music`, `play`, `skip`, `stop`, `nowplaying`, `queue`, `playlist`, `favorites` | 8 | 32 (music 15, playlist 8, queue 5, favorites 4) |
| `community` | `rolepanel`, `ticket`, `profile`, `checkin`, `announce`, `giveaway` | 6 | 21 (ticket 4, profile 6, rolepanel 3, giveaway 4, announce 3) |
| `ai` | `tts`, `emojimaker` | 2 | 9 (tts 9) |
| `fun` | `dice`, `guess`, `rps`, `ohaasa` | 4 | 0 |
| `utility` | `avatar`, `delivery`, `info`, `invite`, `ping`, `weather`, `privacy`, `help` | 8 | 8 (weather 4, info 2, privacy 2) |
| `admin` | `settings`, `purge`, `mixer`, `chat-settings`, `chattools` | 5 (2 after the `/설정` PR) | 13 (mixer 7, chat-settings 4, chattools 2); 0 after the PR |
| Total global | | 33 (30 after the `/설정` PR) | 82 |
| Dev-only (not global) | `emojis`, `eval`, `nodes`, `reload`, `shards`, `wrapped` | 6 | |

How to recount:

1. Command names: the `EXPECTED_COMMAND_CATEGORIES` list in `apps/bot/src/core/pieceInventory.test.ts`, minus entries ending in `=개발`; or the `commands` arrays in `packages/utils/src/modules.ts`.
2. Subcommands: the number of `addSubcommand(` calls in the command file. `music` and `info` build their subcommands from a `SUBCOMMANDS` array in `apps/bot/src/features/music/discord/commands/music.ts` and `apps/bot/src/discord/commands/info.ts`, so count the array entries there.

### 1.4 New command or subcommand?

Make it a subcommand of an existing command when all of these hold:

- It acts on the same noun as an existing command (`queue`, `playlist`, `ticket`), so the existing command's name already describes it.
- The parent has room: at most 25 subcommands per command or group (Discord limit), and the parent's total size stays well inside 8000 characters. `music` already has 15.
- It belongs to the same module as the parent. Module gating (`gatedModuleForCommand` in `packages/utils/src/modules.ts`) looks only at the top-level command name, so a subcommand always follows its parent's module and server toggle. A feature that must be toggled separately needs its own top-level command, or its own module.

Make it a new top-level command when the feature has its own noun and its own weekly use (rule 1 in section 2), needs its own module, or the parent would exceed the size or subcommand limits.

Also required for any new command (enforced by tests):

- Add its `name` to a module in `BOT_MODULES`, or `helpCatalog.test.ts` fails.
- Add a Korean one-line summary in `HELP_COMMAND_SUMMARIES` in `apps/bot/src/discord/help/helpCatalog.ts` (the test requires it unless the help catalog draws the command from subcommand data).
- Add it to `EXPECTED_COMMAND_CATEGORIES` in `apps/bot/src/core/pieceInventory.test.ts`.
- Usage is recorded automatically as `cmd:<name>` or `cmd:<name>.<subcommand>` by `apps/bot/src/discord/listeners/commands/chatInputCommands/chatInputCommandSuccess.ts`; no extra code is needed.

### 1.5 Proposed module ceilings (proposal, not enforced by code)

Nothing in the code caps commands per module. Proposal, to keep half of Discord's limit unused as headroom for future modules:

| Rule | Proposed value |
|---|---|
| Total global slash commands (soft cap) | 50, half of Discord's 100 |
| Per module (top-level commands) | `music` 10, `community` 8, `ai` 4, `fun` 6, `utility` 10, `admin` 4 (sum 42, 8 spare) |
| Subcommands per command | 15 soft cap (the current maximum, `music`), 25 hard (Discord) |
| Review trigger | A PR that takes the global count above 40 states the new total and justifies it |

Go over a ceiling only by retiring or merging an existing command in the same PR, the way the `/설정` consolidation does.

## 2. Criteria for adding a feature

Only what the code or Discord enforces is listed. Put the answers in the PR body (`docs/pr-message-rule.md`).

1. **Weekly repeat use.** The feature should be something a server uses every week (conversation, music, moderation, notifications, participation); a one-off decoration is low priority. This is a product rule, not enforced by code. The usage metrics in rule 3 are how it is judged after release.
2. **Reuse existing assets first.** Look for an existing service, renderer, setting or scheduler before adding one. For example `apps/bot/src/services/guildJobScheduler.ts` for timed work and `packages/utils/src/modules.ts` for module and metric keys; the shared contracts are in `docs/architecture.md`.
3. **Usage metric key.** Usage counts are anonymous daily totals per feature key (`apps/bot/src/features/usage-metrics/application/usageRecorder.ts`; the `FeatureDailyUse` table holds day, feature and count, with no server or user IDs). The key format comes from `usageFeatureKey` in `packages/utils/src/modules.ts`:
   - Slash commands: automatic, key `cmd:<name>[.<sub>]`.
   - Buttons, selects and modals: automatic from the `customId` namespace (`apps/bot/src/discord/listeners/CoreInteractionCreate.ts`), key `ns:<namespace>`. List the namespace in `componentNamespaces` of the module.
   - Features with no command (message or event driven): the listener must call `container.usageRecorder?.record(guildId, usageFeatureKey('msg', '<id>'), userId)` itself, as `apps/bot/src/discord/listeners/message/emojiEnlarge.ts` does, and the `<id>` must be listed in the module's `messageFeatures`.
   - Keys are cut at 64 characters. A key that `featureModule` cannot resolve is not attributed to any module, so register it in `BOT_MODULES` first.
4. **Module and toggle.** Every feature belongs to one module in `BOT_MODULES` (`packages/utils/src/modules.ts`); `packages/utils/src/modules.test.ts` fails if a command, namespace or message feature belongs to two. Modules with `toggleable: true` can be turned off per server; only `admin` cannot. `apps/bot/src/lib/moduleGate.ts` gates slash commands (by top-level name) and component namespaces. A message-feature listener must check the toggle itself with `isMessageFeatureEnabled` from `apps/bot/src/services/guildSettings/modules.ts`, as `emojiEnlarge.ts` does. A new module also needs a label, emoji and description in the same table, and shows up in help and in the dashboard (`apps/dashboard/src/components/servers/modules-settings.tsx`). The `help` and `privacy` commands and the `help` and `onboarding` namespaces are never gated (`ALWAYS_ALLOWED_COMMANDS`, `ALWAYS_ALLOWED_NAMESPACES`).
5. **Personal data impact.** If the feature stores a user ID, user-written text, a birthday or any other personal data:
   - Compare it with the privacy policy page, `apps/dashboard/src/app/privacy/page.tsx`. At the time of writing the page names AI memory, birthday and intro, TTS settings, game records, server settings and anonymous usage counts, and it states no concrete retention period. Retention values for the existing tables are still an open decision (P-13); do not invent a number for them, but state the retention you propose for the new data.
   - Decide the `/privacy forget` behavior. `purgeUserData` in `apps/bot/src/features/user-data/application/userDataService.ts` currently clears AI memory (long term, short term, summary), birthday and intro, TTS settings and game records. New personal data is not covered until it is added there, and `/privacy view` (`summarizeUserData` in the same file) should show it too.
   - Name the storage (table or Redis key) and who can delete it in the PR.
   - Update the privacy policy text in the same PR if it does not already cover the data.
6. **Scheduled per-guild work.** Timed actions (reminders, giveaways, birthdays) use `GuildJobScheduler` in `apps/bot/src/services/guildJobScheduler.ts`; do not add a new `setInterval`. Register a handler with `register(kind, handler)` for a new `kind` string (registering the same kind twice throws; an unknown kind is closed as failed). Create rows with `schedule()` and cancel with `cancel()`. A repeating job schedules its next row from the handler using `nextRunAt()` in `apps/bot/src/services/jobRecurrence.ts`. A job gets 3 attempts with 30 second and 2 minute backoff, and a handler must tolerate a re-run after a crash (jobs stuck in running for 5 minutes are reset to pending). Registered kinds: `scheduled-message` (`features/scheduled-messages/`), `giveaway_end` (`features/giveaway/`, payload `{ giveawayId }`, idempotent: an already ended giveaway only re-announces when `announcedAt` is empty) and `birthday_daily` (`features/birthday/`: one pending row per guild, the handler inserts the next day's row before it sends, and `reconcile()` at `clientReady` recreates a chain that broke). A feature with no command still counts its use: birthday celebrations record `msg:birthday` and `birthday` is listed in the `community` module's `messageFeatures`. `start()` is called from `apps/bot/src/discord/listeners/clientReady.ts`, so register handlers during bot setup, before that.
7. **Gateway intents.** The bot requests `Guilds`, `GuildMembers`, `GuildMessages`, `GuildMessageReactions`, `GuildModeration`, `GuildVoiceStates` and `MessageContent` in `apps/bot/src/core/botClient.ts`. Message Content is already approved for this bot (decision D-13), so there is no approval to chase. The rule for new features: the PR states which intents the feature needs. An intent outside the list above must be called out explicitly, since a new privileged intent needs Discord approval first. For Message Content, prefer a slash command, button or modal when it can do the job; use message content only when typing in chat is the feature itself (a pinned music channel, counting, chat TTS). The message features that read content today are `music-channel`, `custom-command` (prefix form), `emoji-enlarge`, `message-quote`, `embed-fix`, `counting`, `ai-mention` and `chat-tts`.
8. **External dependencies.** A feature that calls a new external API, LLM or GPU service names the dependency in the PR and adds it to `docs/3rdparty.md`. There is no cost budget mechanism in code today.

## 3. PR checklist

Copy the points that apply into the PR body's summary or decision log:

- [ ] Weekly repeat use, in one sentence.
- [ ] Reused assets, or why a new one was needed.
- [ ] Module id, and whether the toggle covers every entry point (command, namespace, message feature).
- [ ] Metric key(s) and where they are recorded.
- [ ] Global slash command count before and after (section 1.3), and why a subcommand was or was not enough.
- [ ] Personal data stored, privacy page and `/privacy` impact.
- [ ] Scheduler `kind`, if any.
- [ ] Gateway intents needed.
- [ ] Docs updated: `docs/architecture.md` if a contract changed, this file if the command table changed.
