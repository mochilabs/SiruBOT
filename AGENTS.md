# SiruBOT: Agent Instructions

Monorepo (Turborepo + Yarn v4 workspaces): `apps/bot` (Sapphire/Discord.js music bot), `apps/dashboard` (Next.js 16), `apps/data-api` (Fastify 게이트웨이 — canvas 이미지 렌더링·외부 프로바이더 캐시·Redis 허브·LLM 배치·길드 데이터 request/reply(채널/역할 봇 캐시 프록시)), `apps/shardmanager` (Fastify WS), `apps/storage` (Fastify 오브젝트 스토리지), `apps/notifier` (Fastify 소셜 알림 웹훅·스케줄러); `packages/prisma|shardclient|utils|app-kit`.

## Branch rule

Every code change must start on a feature/fix/refactor branch created from `beta` (or `main`). Never commit directly to `beta`/`main`.

## PR rules

PR 제목·본문 작성 규칙은 [`docs/pr-message-rule.md`](docs/pr-message-rule.md)를 따르세요. 본문에는 항상 실행한 검증과 미검증 항목을 남기고, UI 변경에는 스크린샷을 포함해요.

## Skills

Load the matching skill (`.pi/skills/<id>/SKILL.md`) before starting work in its domain — don't recreate its templates inline:

- `sapphire-command` — bot slash commands and preconditions (precondition chain order is a fragile contract); `component-view` — Components V2 view files
- `bot-features` — AI chat/aiTools/memory, TTS·mixer·lyrics, temp voice channels, games; `bot-ops` — playback/Lavalink/session/shard operations
- `dashboard-conventions` — Next.js dashboard code (SWR/fetcher, zustand, API routes + zod, next-auth, security); `repo-infra` — prisma, utils subpaths, yarn/turbo, CI, Sentry/logging
- `dashboard-ui` — dashboard visual work: design tokens, primitives, Discord-style specs, scroll/motion effects; load `antislop-ui` (anti-slop filter) first
- `security-audit` — evidence-driven vulnerability review
- `ai-slop-cleaner` — deletion-first cleanup of duplicated/dead/over-abstracted code and AI-slop comments

## Commands

```bash
yarn install                          # Corepack Yarn 4, node-modules linker, Node 22+
yarn generate                         # REQUIRED before typecheck/build (Prisma client)
yarn workspace @sirubot/prisma migrate:dev
yarn dev                              # dashboard dev server only (the only `dev` script in the repo)
yarn watch                            # rebuild bot/data-api/notifier/storage/shardmanager + packages on change
yarn lint / yarn lint:fix             # turbo fan-out; pre-push hook runs lint:fix + typecheck
yarn typecheck                        # turbo; dependsOn ^build ^generate — don't run bare tsc first
```

- Lint differs per package: bot/data-api/shardmanager/storage/notifier/packages(utils·shardclient·app-kit) = `prettier --check "src/**/*.ts"`; **dashboard = `eslint . --max-warnings=0`** (not prettier).
- Prettier style: tabs, single quotes, `printWidth: 150`, `trailingComma: none`.
- CI (`lint.yml`) runs `yarn install --immutable` + `yarn lint` + `yarn typecheck` + `yarn test`. Vitest suites live at the **root `vitest.config.ts`** — every workspace test script runs with `--config ../../vitest.config.ts` (dashboard만 예외 — 자체 `vitest.config.ts`로 `*.test.tsx` 포함), so `@sirubot/utils` (and subpaths like `@sirubot/utils/redisEnvelope`) resolve to **source** via aliases. Tests therefore run without building `packages/utils` dist: raw `vitest` runs can never see a stale dist artifact. Per-workspace: `yarn workspace @sirubot/bot test` etc. (bot ×36 files, data-api ×17, utils ×15, dashboard ×21, storage ×6, notifier ×6, shardclient ×1, shardmanager ×1 as of 2026-10-20; root-wide `yarn test` = 103 files); prisma has no tests yet.
- Dashboard quirk: `dev` uses `--webpack`, `build` uses `--turbopack`.
- Turbo `build` depends on `^typecheck ^generate ^build` (not `^lint:fix`) — building one app rebuilds deps.

## Bot conventions (see skills first)

- Load the matching skill before writing bot code: `sapphire-command` (covers preconditions), `component-view`, `bot-features`, `bot-ops` (in `.pi/skills/`). Don't duplicate their templates here.
- Modules are `audio`, `general`, `voice`, and `games` — registered via `setupStore()` in `apps/bot/src/core/bootstrap.ts`. Place files under `apps/bot/src/modules/<audio|general|voice|games>/{commands,preconditions,listeners,interaction-handlers}/`.
- TS: `allowImportingTsExtensions` — **always use `.ts` extension in bot relative imports** (e.g. `./logger.ts`). ESM (`type: module`), strict + decorators.
- Slash commands: `registerApplicationCommands` + `GuildInstall` integration, `ko` primary / `en-US` fallback localizations, `fullCategory: ['음악'|'일반'|'개발'|'게임']`, `deferReply()` before async work, throw `UserError({ identifier, message, context: { ephemeral: true } })` for user errors. All user-facing strings in Korean.
- Preconditions referenced by string name in `preconditions: [...]`; common audio set: `TextChannelAllowed, NodeAvailable, VoiceConnected, SameVoiceChannel, MemberListenable, ClientVoiceConnectable, ClientVoiceSpeakable`.
- 커스텀 명령어(예전 봇 스타일 메시지 트리거): 접두사 메시지 리스너 `modules/general/listeners/message/customCommandPrefix.ts`가 "접두사+이름" 메시지를 실행 (`!도움말`은 예약어 목록 조회). 스펙·이름·접두사 규칙의 단일 계약은 `packages/utils/src/customCommand.ts`, 실행 엔진·캐시는 `apps/bot/src/services/customCommands/`(`interpreter.ts`, `store.ts` — 실행 전 spec zod 재검증 필수). 생성·수정·삭제는 대시보드(관리자) 전용이고 저장 시 `GUILD_SETTINGS_INVALIDATE_CHANNEL`로 봇 캐시가 무효화돼요.
- Command registration behavior: `REGISTER_COMMANDS=true` → `Overwrite`, else `LogToConsole` (`core/setup.ts`). Manual sync: `yarn dlx tsx scripts/register-commands.ts [--dry-run] [--global|--guild <id>]` (guild defaults to `GUILD_ID`/`DEV_GUILD_IDS` env).
- Container services: `container.db` (Prisma), `container.redisStore`, `container.audio` (LavalinkManager), `container.logger`, `container.shardInfo`, `container.{guildService,trackService,playlistService,audioService,mixerService,tempVoiceService,aiMemoryService}`, `container.{playerNotifier,playerWebResponder,guildDataResponder,guildSettingsInvalidator,jtcSetupResponder,appEmojiManager,botProfileService,memberGreetingService,socialWebhookResponder}` — 대부분 `core/botApplication.ts`에서 할당, `container.lavalinkHandler`·`container.shardClient`는 `core/bootstrap.ts`에서.
- UI: Discord Components V2 (`MessageFlags.IsComponentsV2`, `ContainerBuilder`/`TextDisplayBuilder`), color via `DEFAULT_COLOR` from `@sirubot/utils`.

## `@sirubot/utils` 배럴 vs 서브패스

- 루트 배럴(`@sirubot/utils`)은 node 전용 모듈(version·appEmoji·redisSubscriber·youtube·embed·logger)을 함께 노출하므로 **서버 앱 전용**이에요. 클라이언트 번들(대시보드)은 서브패스만 임포트해요 — `apps/dashboard/eslint.config.mjs`의 `no-restricted-imports`가 루트 임포트를 에러로 막아요.
- 순수 계약(zod 스키마·타입·상수·에러 클래스)은 서브패스로 노출해요. 서브패스를 추가(또는 제거)할 때는 `packages/utils/package.json`의 `exports`와 `tsup.config.ts`의 `entry`를 **함께** 수정해야 `dist/*.{js,cjs,d.ts}`가 생성돼요 (선례: `/time` `/storage` `/playerWeb` `/weather` `/delivery` `/client`).
- 도메인 계약의 이중 정의 금지 — 날씨(`@sirubot/utils/weather`)·택배(`@sirubot/utils/delivery`) 타입·에러 클래스·운송장 정규화의 단일 홈은 `packages/utils/src/{weather,delivery}.ts`이고 봇·data-api는 import만 해요.

## Env / runtime gotchas

- Per-app `.env` files (`apps/bot/.env`, `apps/dashboard/.env`); bot loads via `@skyra/env-utilities` from CWD. Never print or commit secrets.
- `LAVALINK_HOSTS` format (`parseLavalinkHosts` in `packages/utils/src/lavalinkHosts.ts`): comma-separated `id_host_port[_password]`, e.g. `main_localhost_2333_youshallnotpass`.
- data-api 키 계약: data-api는 `DATA_API_AUTH_KEY ?? AUTH_KEY`가 없으면 **기동 거부(fail-closed)**, 인증 면제는 `/api/health`뿐. 대시보드는 `DATA_API_URL`(기본 `http://localhost:3002`) + 같은 폴백 체인의 키로 호출하며, 키 미설정 시 호출 전면 스킵 → 길드 채널/역할/플레이어 연동이 전부 502처럼 보인다. `Authorization` 헤더는 `Bearer` 없이 **키 원문 그대로**. 대시보드/봇/data-api 세 앱이 같은 키를 공유해야 한다.
- data-api의 OpenAI 호환 LLM 계약: `OPENAI_COMPATIBLE_API_URL` + `OPENAI_API_KEY`로 번역(`TRANSLATION_MODEL`)과 커스텀 명령어 초안 생성(`CUSTOM_COMMAND_DRAFT_MODEL`, 미설정 시 TRANSLATION_MODEL 폴백)이 함께 쓰인다. 키 없으면 번역은 원문 served, 초안 생성(`/v1/ai/custom-command-draft`)은 503 안내.
- storage 키·공개 URL 계약: `apps/storage`(3003)는 `STORAGE_AUTH_KEY ?? AUTH_KEY`가 없으면 **기동 거부(fail-closed)**, 인증 면제는 `/health`와 공개 오브젝트 GET뿐. `STORAGE_PUBLIC_URL`(필수, https)은 디스코드가 임베드로 fetch하는 공개 주소이며 발급 URL 스냅샷이라 도메인 변경 시 기존 에셋 URL 일괄 치환이 필요하다. 저장소는 로컬 볼륨(무DB)이라 `STORAGE_DATA_DIR`(컨테이너 `/data`)를 `storage-data` 볼륨으로 영속화해야 한다.
- Fastify 인증·로거·env 검증 공용은 `packages/app-kit`(`createKeyAuthHook`/`createKeyPreHandler`/`timingSafeKeyEqual`, `parseEnvOrExit`/`authKeyChain`, `getAppLogger`) — data-api·shardmanager·storage·notifier가 사용. app-kit 로거 설정은 `packages/utils` `createLogger`의 수동 미러라 utils 쪽 변경 시 함께 갱신.
- Dev runs standalone (`shards: [0]`); production requires `SHARD_MANAGER_URL` + `AUTH_KEY` and does blocking `ShardClient.identify()` with retry. Redis (`REDIS_URL`) holds Lavalink sessions + queue; shutdown order is save-sessions → audio listener cleanup → Redis subscriber services stop (guildSettingsInvalidator·playerWebResponder·jtcSetupResponder·botProfileService·memberGreetingService·guildDataResponder·socialWebhookResponder) → pending-journal flush (queueStore/playerSaver) → redis disconnect → db disconnect → gateway destroy. `LAVALINK_HOSTS` is parsed by `parseLavalinkHosts` in `packages/utils/src/lavalinkHosts.ts` (zod; throws on malformed entries before Lavalink connect).
- Key entrypoints: `apps/bot/src/index.ts → core/setup.ts → core/bootstrap.ts → core/botApplication.ts`; env/Sentry handlers in `core/environment.ts`; Prisma schema at `packages/prisma/src/schema.prisma`; shared tsup base at `scripts/tsup.config.ts` (ESM, `src/**/*.ts` entry).
