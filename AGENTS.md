# SiruBOT — Agent Instructions

Monorepo (Turborepo + Yarn v4 workspaces): `apps/bot` (Sapphire/Discord.js music bot), `apps/dashboard` (Next.js 16), `apps/data-api` (Fastify 게이트웨이 — canvas 이미지 렌더링·외부 프로바이더 캐시·Redis 허브·LLM 배치·길드 데이터 request/reply(채널/역할 봇 캐시 프록시)), `apps/shardmanager` (Fastify WS); `packages/prisma|shardclient|utils`.

## Branch & index rules

- **Branch rule**: Every code change must start on a feature/fix/refactor branch created from `beta` (or `main`). Never commit directly to `beta`/`main`.
- **Index rule**: Before modifying unfamiliar code, always use the OpenCode semantic index (`codebase_search`, `codebase_context`, `call_graph`) instead of raw grepping. Check `index_status` if unsure.

## PR rules

PR 제목·본문 작성 규칙은 [`docs/pr-message-rule.md`](docs/pr-message-rule.md)를 따르세요. 본문에는 항상 실행한 검증과 미검증 항목을 남기고, UI 변경에는 스크린샷을 포함해요.

## Skills

Load the matching skill (`.opencode/skills/<id>/SKILL.md`) before starting work in its domain — don't recreate its templates inline:

- `codebase-search` — semantic search / orienting in the repo before editing unfamiliar code
- `sapphire-command` — bot slash commands; `sapphire-precondition` — command guards (both under `apps/bot/src/modules/`)
- `dashboard-conventions` — Next.js dashboard code (SWR/fetcher, zustand, API routes + zod, next-auth, security)
- `design-tokens` — dashboard color/type/spacing/radius/dark-mode tokens; `ui-primitives` — primitives/overlay/layout components; `discord-patterns` — Discord-style UI
- `scroll-effects` — dashboard scroll/motion effects
- `ai-slop-cleaner` — deletion-first cleanup of duplicated/dead/over-abstracted code

## Semantic code search (opencode index)

The repo is indexed (7,348 chunks total / 5,434 on the current branch, auto-incrementing via `.opencode/index/codebase.db`). Prefer semantic tools before raw grepping when locating unfamiliar code:
- `codebase_search` — natural-language chunk search (best first step)
- `codebase_context` — repo-scale question with cited lines; `codebase_edit_context` — pre-edit context for a known symbol
- `call_graph` / `call_graph_path` — callers/callees and connection paths between symbols
- If index readiness is unknown, check `index_status` first. The watcher re-indexes automatically after ~10s; large changes may need `/index`.

**Rule: if you are unfamiliar with this codebase (or the area you are about to touch), search it before you edit.** Orient with the semantic tools, read the relevant source, then change code — never guess file/function locations from memory. See the `codebase-search` skill (`.opencode/skills/codebase-search/SKILL.md`) for the full tool guide and configuration reference (open-codebase-index docs: https://github.com/Helweg/open-codebase-index/blob/main/docs/configuration.md).

## Local documentation (`localdocs/`)

- These instructions apply only when the repository-root `localdocs/` directory exists. If it is absent, skip this section and work from the source code; do not create the directory unless the user explicitly requests it.
- Use the repository-root `localdocs/` directory as persistent codebase notes and working memory across sessions. Agents may read, search, create, and update Markdown files there as part of their work without separate approval.
- At the start of a task, read `localdocs/README.md` (document index) and `localdocs/08-working-memory.md` when available, then read the documents relevant to the task and their referenced source files.
- The directory is Git-ignored, so normal tracked-file searches may omit it. Discover documents with `rg --files --hidden --no-ignore localdocs -g '*.md'`; search their contents with `rg --hidden --no-ignore '<pattern>' localdocs`.
- Verify the current branch, commit, and working tree before using old notes. Documentation may describe another branch or an earlier implementation; current source code and the user's instructions take precedence. Correct outdated notes after checking the code.
- Keep documents focused by topic, use descriptive filenames consistent with the existing index, and add new documents to `localdocs/README.md`. Reference related documents and source files with relative Markdown links; avoid duplicating large code blocks.
- Record the date and branch/commit baseline, architecture and behavior, relevant source paths, decisions and constraints, validation results, and unresolved questions or next steps. Distinguish verified behavior, hypotheses, proposed changes, and untested runtime behavior; never imply a test or measurement was performed when it was not.
- When a task changes documented behavior, update the relevant notes and leave concise handoff context in `localdocs/08-working-memory.md` so the next session can resume without repeating the investigation. Supersede obsolete guidance clearly.
- Keep `localdocs/` ignored and local unless the user explicitly requests that its contents be committed. Do not force-add it or change its ignore rule. Never put secrets, environment values, tokens, or private user data in these notes.

## Commands

```bash
yarn install                          # Corepack Yarn 4, node-modules linker, Node 22+
yarn generate                         # REQUIRED before typecheck/build (Prisma client)
yarn workspace @sirubot/prisma migrate:dev
yarn dev                              # all apps; single: turbo dev --filter=@sirubot/bot
yarn lint / yarn lint:fix             # turbo fan-out; pre-push hook runs lint:fix + typecheck
yarn typecheck                        # turbo; dependsOn ^build ^generate — don't run bare tsc first
```

- Lint differs per package: bot/shardmanager/packages = `prettier --check "src/**/*.ts"`; **dashboard = `eslint . --max-warnings=0`** (not prettier).
- Prettier style: tabs, single quotes, `printWidth: 150`, `trailingComma: none`.
- CI (`lint.yml`) runs `yarn install --immutable` + `yarn lint` + `yarn typecheck` + `yarn test`. Vitest suites live at the repo root config: per-workspace `vitest run --passWithNoTests` (bot ×11, data-api ×8, utils ×6, shardclient ×1, dashboard ×1 as of 2026-10-12, src 기준 — data-api는 `dist/` 빌드 산출물 테스트까지 함께 매칭되어 중복 실행됨); shardmanager/prisma have no tests yet.
- Dashboard quirk: `dev` uses `--webpack`, `build` uses `--turbopack`.
- Turbo `build` depends on `^typecheck ^generate ^build` (not `^lint:fix`) — building one app rebuilds deps.

## Bot conventions (see skills first)

- Load the matching skill before writing bot code: `sapphire-command`, `sapphire-precondition` (in `.opencode/skills/`). Don't duplicate their templates here.
- Modules are `audio`, `general`, `voice`, and `games` — registered via `setupStore()` in `apps/bot/src/core/bootstrap.ts`. Place files under `apps/bot/src/modules/<audio|general|voice|games>/{commands,preconditions,listeners,interaction-handlers}/`.
- TS: `allowImportingTsExtensions` — **always use `.ts` extension in bot relative imports** (e.g. `./logger.ts`). ESM (`type: module`), strict + decorators.
- Slash commands: `registerApplicationCommands` + `GuildInstall` integration, `ko` primary / `en-US` fallback localizations, `fullCategory: ['음악'|'일반'|'개발'|'게임']`, `deferReply()` before async work, throw `UserError({ identifier, message, context: { ephemeral: true } })` for user errors. All user-facing strings in Korean.
- Preconditions referenced by string name in `preconditions: [...]`; common audio set: `TextChannelAllowed, NodeAvailable, VoiceConnected, SameVoiceChannel, MemberListenable, ClientVoiceConnectable, ClientVoiceSpeakable`.
- 커스텀 명령어(예전 봇 스타일 메시지 트리거): 접두사 메시지 리스너 `modules/general/listeners/message/customCommandPrefix.ts`가 "접두사+이름" 메시지를 실행 (`!도움말`은 예약어 목록 조회). 스펙·이름·접두사 규칙의 단일 계약은 `packages/utils/src/customCommand.ts`, 실행 엔진·캐시는 `apps/bot/src/services/customCommands/`(`interpreter.ts`, `store.ts` — 실행 전 spec zod 재검증 필수). 생성·수정·삭제는 대시보드(관리자) 전용이고 저장 시 `GUILD_SETTINGS_INVALIDATE_CHANNEL`로 봇 캐시가 무효화돼요.
- Command registration behavior: `REGISTER_COMMANDS=true` → `Overwrite`, else `LogToConsole` (`core/setup.ts`). Manual sync: `yarn dlx tsx scripts/register-commands.ts [--dry-run] [--global|--guild <id>]` (guild defaults to `GUILD_ID`/`DEV_GUILD_IDS` env).
- Container services: `container.db` (Prisma), `container.redisStore`, `container.audio` (LavalinkManager), `container.logger`, `container.shardInfo`, `container.{guildService,trackService,playlistService,audioService,mixerService,tempVoiceService,aiMemoryService}`, `container.{playerNotifier,playerWebResponder,guildDataResponder,guildSettingsInvalidator,jtcSetupResponder,appEmojiManager,botProfileService,memberGreetingService}` — 대부분 `core/botApplication.ts`에서 할당, `container.lavalinkHandler`·`container.shardClient`는 `core/bootstrap.ts`에서.
- UI: Discord Components V2 (`MessageFlags.IsComponentsV2`, `ContainerBuilder`/`TextDisplayBuilder`), color via `DEFAULT_COLOR` from `@sirubot/utils`.

## Env / runtime gotchas

- Per-app `.env` files (`apps/bot/.env`, `apps/dashboard/.env`); bot loads via `@skyra/env-utilities` from CWD. Never print or commit secrets.
- `LAVALINK_HOSTS` format (`parseLavalinkHosts` in `packages/utils/src/lavalinkHosts.ts`): comma-separated `id_host_port[_password]`, e.g. `main_localhost_2333_youshallnotpass`.
- data-api 키 계약: data-api는 `DATA_API_AUTH_KEY ?? AUTH_KEY`가 없으면 **기동 거부(fail-closed)**, 인증 면제는 `/api/health`뿐. 대시보드는 `DATA_API_URL`(기본 `http://localhost:3002`) + 같은 폴백 체인의 키로 호출하며, 키 미설정 시 호출 전면 스킵 → 길드 채널/역할/플레이어 연동이 전부 502처럼 보인다. `Authorization` 헤더는 `Bearer` 없이 **키 원문 그대로**. 대시보드/봇/data-api 세 앱이 같은 키를 공유해야 한다.
- data-api의 OpenAI 호환 LLM 계약: `OPENAI_COMPATIBLE_API_URL` + `OPENAI_API_KEY`로 번역(`TRANSLATION_MODEL`)과 커스텀 명령어 초안 생성(`CUSTOM_COMMAND_DRAFT_MODEL`, 미설정 시 TRANSLATION_MODEL 폴백)이 함께 쓰인다. 키 없으면 번역은 원문 served, 초안 생성(`/v1/ai/custom-command-draft`)은 503 안내.
- storage 키·공개 URL 계약: `apps/storage`(3003)는 `STORAGE_AUTH_KEY ?? AUTH_KEY`가 없으면 **기동 거부(fail-closed)**, 인증 면제는 `/health`와 공개 오브젝트 GET뿐. `STORAGE_PUBLIC_URL`(필수, https)은 디스코드가 임베드로 fetch하는 공개 주소이며 발급 URL 스냅샷이라 도메인 변경 시 기존 에셋 URL 일괄 치환이 필요하다. 저장소는 로컬 볼륨(무DB)이라 `STORAGE_DATA_DIR`(컨테이너 `/data`)를 `storage-data` 볼륨으로 영속화해야 한다.
- Dev runs standalone (`shards: [0]`); production requires `SHARD_MANAGER_URL` + `AUTH_KEY` and does blocking `ShardClient.identify()` with retry. Redis (`REDIS_URL`) holds Lavalink sessions + queue; shutdown order is save-sessions → audio listener cleanup → Redis subscriber services stop (guildSettingsInvalidator·botProfileService·memberGreetingService·guildDataResponder) → pending-journal flush (queueStore/playerSaver) → redis disconnect → db disconnect → gateway destroy. `LAVALINK_HOSTS` is parsed by `parseLavalinkHosts` in `packages/utils/src/lavalinkHosts.ts` (zod; throws on malformed entries before Lavalink connect).
- Key entrypoints: `apps/bot/src/index.ts → core/setup.ts → core/bootstrap.ts → core/botApplication.ts`; env/Sentry handlers in `core/environment.ts`; Prisma schema at `packages/prisma/src/schema.prisma`; shared tsup base at `scripts/tsup.config.ts` (ESM, `src/**/*.ts` entry).

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read `antislop.md` (core) and then the skill for the task:
- UI / visual: `skills/antislop-ui/SKILL.md`
- Copy & text: `skills/antislop-copywriting/SKILL.md`
- People: `skills/antislop-human/SKILL.md`
- Mobile / responsive: `skills/antislop-layoutmobile/SKILL.md`
- Code comments: `skills/antislop-code/SKILL.md`
Before starting, follow the core's "Two Usage Modes" section in strict order: explicit session instruction first, then global preference, then ask. A session instruction always wins. For a resolved mode, say `antislop active: <mode> (session override).` or `antislop active: <mode> (global preference).` once before presenting findings or making edits, using the actual mode and source. Acknowledging the user's request without naming the source does not replace this notice.
Only an explicit choice of antislop during or after selects a session mode. A request to review, audit, or avoid file edits does not select a mode; read the global preference in that case. Another skill's mode does not select antislop's mode.
If the mode is unresolved, ask during/after and end the response; wait for the answer before any UI review, planning, or concept. For read-only tasks, put the active-mode notice only at the start of the final answer, never in progress messages. For editing tasks, announce before the first edit and omit it from the final answer.
To update antislop later: download `antislop.md` again, or run `npx antislop-ai --update` if it was installed as skill folders.
<!-- antislop:end -->
