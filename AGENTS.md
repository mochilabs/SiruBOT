# SiruBOT — Agent Instructions

Monorepo (Turborepo + Yarn v4 workspaces): `apps/bot` (Sapphire/Discord.js music bot), `apps/dashboard` (Next.js 16), `apps/shardmanager` (Fastify WS); `packages/prisma|shardclient|utils`.

## Commands

```bash
yarn install                          # Corepack Yarn 4, node-modules linker, Node 22+
yarn generate                         # REQUIRED before typecheck/build (Prisma client)
yarn workspace @sirubot/prisma migrate:dev
yarn dev                              # all apps; single: turbo dev --filter=@sirubot/bot
yarn lint / yarn lint:fix             # turbo fan-out; pre-push hook runs lint:fix + typecheck
yarn typecheck                        # turbo; dependsOn ^generate — don't run bare tsc first
```

- Lint differs per package: bot/shardmanager/packages = `prettier --check "src/**/*.ts"`; **dashboard = `eslint . --max-warnings=0`** (not prettier).
- Prettier style: tabs, single quotes, `printWidth: 150`, `trailingComma: none`.
- CI (`lint.yml`) only runs `yarn install --immutable` + `yarn lint`. No test framework; `yarn test` is a stub.
- Dashboard quirk: `dev` uses `--webpack`, `build` uses `--turbopack`.
- Turbo `build` depends on `^lint:fix ^typecheck ^generate ^build` — building one app rebuilds deps.

## Bot conventions (see skills first)

- Load the matching skill before writing bot code: `sapphire-command`, `sapphire-precondition` (in `.opencode/skills/`). Don't duplicate their templates here.
- Modules are `audio`, `general`, `voice`, and `games` — registered via `setupStore()` in `apps/bot/src/core/bootstrap.ts`. Place files under `apps/bot/src/modules/<audio|general|voice|games>/{commands,preconditions,listeners,interaction-handlers}/`.
- TS: `allowImportingTsExtensions` — **always use `.ts` extension in bot relative imports** (e.g. `./logger.ts`). ESM (`type: module`), strict + decorators.
- Slash commands: `registerApplicationCommands` + `GuildInstall` integration, `ko` primary / `en-US` fallback localizations, `fullCategory: ['음악'|'일반'|'개발'|'게임']`, `deferReply()` before async work, throw `UserError({ identifier, message, context: { ephemeral: true } })` for user errors. All user-facing strings in Korean.
- Preconditions referenced by string name in `preconditions: [...]`; common audio set: `TextChannelAllowed, NodeAvailable, VoiceConnected, SameVoiceChannel, MemberListenable, ClientVoiceConnectable, ClientVoiceSpeakable`.
- Command registration behavior: `REGISTER_COMMANDS=true` → `Overwrite`, else `LogToConsole` (`core/setup.ts`). Manual sync: `yarn dlx tsx scripts/register-commands.ts [--dry-run] [--global|--guild <id>]` (guild defaults to `GUILD_ID`/`DEV_GUILD_IDS` env).
- Container services (`core/botApplication.ts`): `container.db` (Prisma), `container.redisStore`, `container.audio` (LavalinkManager), `container.{audioService,guildService,trackService,playlistService}`, `container.lavalinkHandler/playerNotifier/shardClient`.
- UI: Discord Components V2 (`MessageFlags.IsComponentsV2`, `ContainerBuilder`/`TextDisplayBuilder`), color via `DEFAULT_COLOR` from `@sirubot/utils`.

## Env / runtime gotchas

- Per-app `.env` files (`apps/bot/.env`, `apps/dashboard/.env`); bot loads via `@skyra/env-utilities` from CWD. Never print or commit secrets — a `secret-blocker` plugin (`.opencode/plugins/secret-blocker.ts`) rewrites offending `bash` commands, blocks `write`/`edit` containing literals, and redacts secrets from bash output.
- `LAVALINK_HOSTS` format (parsed in `bootstrap.ts`): comma-separated `id_host_port[_password]`, e.g. `main_localhost_2333_youshallnotpass`.
- Dev runs standalone (`shards: [0]`); production requires `SHARD_MANAGER_URL` + `AUTH_KEY` and does blocking `ShardClient.identify()` with retry. Redis (`REDIS_URL`) holds Lavalink sessions + queue; shutdown order is save-sessions → remove audio listeners → redis disconnect → db disconnect.
- Key entrypoints: `apps/bot/src/index.ts → core/setup.ts → core/bootstrap.ts → core/botApplication.ts`; env/Sentry handlers in `core/environment.ts`; Prisma schema at `packages/prisma/src/schema.prisma`; shared tsup base at `scripts/tsup.config.ts` (ESM, `src/**/*.ts` entry).
