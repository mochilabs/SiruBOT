# 기능 배치 계획 — 게임 정리 · 음악 커맨드 분리 · 서버 관리 강화 · Sentry

> **상태**: pending (계획 확정 — PR 1부터 착수 가능)
> **형태**: 다중 PR 로드맵. 각 PR은 독립 머지 단위, 상세 task 분해는 해당 PR 착수 시 별도 계획으로 파생
> **Baseline**: `beta` @ `13c323f5` (2026-10-22)

---

## 결정 요약 (확정 사항)

| 항목 | 결정 |
|---|---|
| `/운세` | **드롭** (`/오하아사` 유지) |
| `/가위바위보` (봇 혼자) | **드롭** (전체 제거, DB 과거 기록은 보존) |
| `/주사위` | **유지**, `식` 문자열 → **정수 옵션(개수/면)으로 완전 교체** |
| 사다리타기 | **신규 — 버튼 참가 방식** (모집 → 시작 → 랜덤 배정) |
| `/음악 [서브커맨드]` | **단일 커맨드 분리** (`/재생`, `/정지` 등 15개) |
| Autocomplete | `/플레이리스트` name 옵션에 적용 (커스텀 명령어·즐겨찾기·날씨는 제외 — 사유 하단) |
| 인사 이미지 비율 | welcome·goodbye 각각 설정 가능 (기본 16:9, 기존 저장값 하위호환) |
| 티켓 | **v1 보류** (다음 사이클 — 스레드 vs 채널·트랜스크립트 설계부터 별도 계획) |
| 서버 관리 강화 | **경고 시스템 + N회 자동 킥 + 관리 로그 + 역할 받기 패널(이모지·버튼)** |
| Sentry | 봇 갭 표준화 + **대시보드(@sentry/nextjs) 포함** + release/sourcemap 파이프라인. Discord 웹훅 알림 제외 |

---

## PR 1 — 게임 모듈 정리 (작음, 독립)

**Goal**: `/운세`·`/가위바위보` 제거, `/주사위` 옵션을 정수형으로 단순화

- Delete: `apps/bot/src/modules/games/commands/fortune.ts` (해시 기반, DB 의존 없음)
- Delete: `apps/bot/src/modules/games/commands/rps.ts`
- Delete: `apps/bot/src/modules/games/interaction-handlers/games.ts` — **파일 전체가 rps 전용임을 코드로 확인** (`game:rps:*`만 처리)
- Modify: `apps/bot/src/modules/games/utils/gameRecords.ts` — `RpsStats`·`getRpsStats` 제거. `recordGameResult`는 guess 공용이라 유지, `GAME_IDS`(`gameRecords.ts:6`)에서 `'rps'` 제거
- Modify: `apps/bot/src/modules/general/utils/profileCardData.ts` — rps 필드(`rpsWins/rpsLosses/rpsDraws/rpsBestStreak`)·import 제거
- Modify: `apps/bot/src/services/dataApiClient.ts:116-121` — 프로필 카드 payload `gameStats`에서 rps 필드 제거 (`guessBest` 유지). data-api 렌더러(`profileCardDark.ts`·`profileCardTicket.ts`)는 gameStats를 아직 렌더링하지 않음(grep 확인) → data-api 수정 불필요
- Modify: 대시보드 프로필 — `apps/dashboard/src/app/profile/profile-view.tsx`(RPS 표시 제거, `games: { guessBest }`만), `profile-view.test.tsx`, `apps/dashboard/src/lib/profile-stats.ts` (`game: "rps"` 쿼리 제거)
- Modify: `apps/bot/src/modules/games/commands/dice.ts` — `식` 문자열 옵션 제거 → `개수` 정수(1~20, 기본 1) + `면` 정수(2~1000, 기본 6). modifier·`FORMULA_PATTERN` 제거. 결과 표시(굴림 목록 + 합계) 유지
- Modify: `apps/dashboard/src/components/home/command-list-section.tsx` — GAME_COMMANDS에서 운세·가위바위보 행 제거, 주사위 문구 변경
- **손대지 않음 확인**: `apps/bot/src/modules/general/commands/profile.ts:155,352`, `aiTools/ohaasa.ts`, `aiChat/prompt.ts:25`, 대시보드 `ai-chat-preview.tsx:25`의 "운세"는 전부 **별자리 운세(오하아사)** — `/운세` 커맨드와 무관
- DB `gameRecord` 과거 rps 행은 보존 (마이그레이션 없음)
- 검증: `yarn workspace @sirubot/bot test` · 대시보드 vitest · `REGISTER_COMMANDS=true` 기동으로 글로벌 커맨드 정리 확인

## PR 2 — 사다리타기 신규 (중간)

**Goal**: `/사다리` — 버튼 참가 방식 랜덤 배정

- Create: `apps/bot/src/modules/games/commands/ladder.ts` — `/사다리 결과:"커피,피자,꽝"` (쉼표 구분 2~10개, trim·중복 제거). Components V2 게시물: 항목 목록 + `참가` 버튼 + `시작`(주최자 전용) 버튼
- Create: `apps/bot/src/modules/games/interaction-handlers/ladder.ts` — customId `game:ladder:join:{id}` / `game:ladder:start:{id}`
- **샤드 안전 (필수)**: 프로덕션 멀티샤드에서 게시 샤드 ≠ 인터랙션 샤드 가능 → 참가자 상태는 in-memory Map이 아니라 **`container.redisStore`에 저장**: 키 `game:ladder:{id}`, 값 `{ hostId, results, participants }`, TTL 10분. Redis 미연결 메모리 폴백 환경에서는 단독 프로세스라 Map으로도 동작
- 배정 규칙: 항목 셔플 후 참가자 순서대로 매칭. 항목 K < 참가자 M이면 잔여 인원 "꽝", K > M이면 미사용 항목 버림. 시작은 주최자만 (타인 클릭 시 ephemeral 안내)
- 만료: Redis 키 소실 시 "사다리가 만료됐어요. 다시 만들어 주세요."
- 결과 발표: CV2 컨테이너로 채널 공개
- Modify: 대시보드 `command-list-section.tsx` GAME_COMMANDS에 `/사다리` 추가
- Test: 배정 규칙 셔플 유틸 단위 테스트 (bot vitest)

## PR 3 — 음악 커맨드 단일 분리 (큼, 핵심)

**Goal**: `/음악 재생` 디스패처 → `/재생` 등 15개 상위 커맨드 분리. 서브커맨드 모듈(`audio/subcommands/*.ts`)은 그대로 재사용

매핑(현재 `ko` 이름 계승): `play→/재생`, `pause→/일시정지`, `skip→/넘기기`, `stop→/정지`, `previous→/이전곡`, `seek→/위치이동`, `volume→/볼륨`, `repeat→/반복`, `filter→/필터`, `search→/검색`, `lyrics→/가사`, `recommend→/추천`, `autoplay→/자동재생`, `tts→/음성(TTS)`, `history→/재생기록`

- Create: `apps/bot/src/modules/audio/commands/musicCommandBase.ts` — `SubcommandModule`을 받는 공통 베이스: Command.Options의 `preconditions`에 모듈 배열 전달(문자열 이름 지원, `runSubcommandPreconditions`와 동일 실행 경로), `chatInputRun`은 `inCachedGuild` 체크 후 `module.run`, `autocompleteRun`은 모듈의 `autocomplete` 위임
- Create: 옵션 이관 헬퍼 (`lib/subcommandDispatcher.ts`에 추가) — 모듈 `build(SlashCommandSubcommandBuilder)` 결과 옵션을 `SlashCommandBuilder`로 옮기는 유틸. discord.js 빌더 internals 의존 → 단위 테스트 필수. 까다로우면 모듈 build 시그니처를 두 빌더 모두 받게 확장으로 폴백
- Create: thin 커맨드 15개 — `audio/commands/{play,pause,skip,stop,previous,seek,volume,repeat,filter,search,lyrics,recommend,autoplay,musicTts,history}.ts` 각각 `@ApplyOptions({ name, fullCategory: ['음악'] })` + 베이스 상속. `tts`는 general의 `/tts` 커맨드와 파일명 구분주의(`musicTts.ts`)
- Delete: `apps/bot/src/modules/audio/commands/music.ts`. **`lib/subcommandDispatcher.ts`·`SubcommandModule` 유지** — `/정보`(`general/commands/info.ts`)가 같은 디스패처 사용
- Modify: `apps/bot/src/modules/general/commands/help.ts` — `MUSIC_SUBCOMMANDS`/`subcommandMention` → 상위 커맨드 멘션으로 단순화 (MUSIC_SUBCOMMANDS 임포터는 help.ts뿐, grep 확인됨)
- Modify: `apps/bot/src/services/aiTools/botHelp.ts` 등 음악 커맨드를 서술하는 AI 도구 문자열
- Modify: 대시보드 `command-list-section.tsx` MUSIC_COMMANDS 전면 교체, `features-section.tsx` 등 `/음악` 언급 grep 후 일괄 정리
- 커맨드 수 26 → 40 (Discord 글로벌 100개 제한 내 여유)
- 검증: bot vitest 전체, `REGISTER_COMMANDS=true` 기동으로 40개 등록 확인, 각 커맨드 거절 경로(음성 채널 미접속 등) 수동 회귀

## PR 4 — Autocomplete (작음)

**Goal**: `/플레이리스트` name 옵션에 유저 플레이리스트 자동완성

- Modify: `apps/bot/src/modules/audio/commands/playlist.ts`
  - 대상: `delete/view/add/add-current/remove/play` 6개 서브커맨드의 `name` 옵션에 `setAutocomplete(true)`
  - `autocompleteRun` 추가: focused 값 startsWith→includes 순 필터, `container.playlistService.getUserPlaylists(userId)` 기반, 최대 25개 `{name, value}` (즐겨찾기 포함 — `getOrCreateFavoritesPlaylist` 보장), defer 없이 즉시 respond
- **제외 확인 완료**: 커스텀 명령어 슬래시는 이름 자체가 길드별 동적 커맨드 등록(`services/customCommands/slashRegistry.ts`)이라 name 옵션 자동완성 불성립. `/즐겨찾기`는 name 옵션 없음(페이지만). `/날씨`는 외부 지오코딩 비용으로 이번 사이클 제외
- 검증: 필터 로직 순수 함수 분리 시 단위 테스트

## PR 5 — 인사 이미지 비율 설정 (중간)

**Goal**: welcome·goodbye 이미지 비율 길드별 설정 (기본 16:9 하위호환)

- Modify: `packages/utils/src/memberGreeting.ts`
  - `GreetingImage`에 `ratio` 추가: `z.enum(['16:9','4:3','1:1','2:1']).default('16:9')` — 기존 저장값 폴백 고려
  - `GREETING_CARD_RATIOS: { '16:9':[1200,675], '4:3':[1200,900], '1:1':[1080,1080], '2:1':[1200,600] }` 상수 추가 (현행 `GREETING_CARD_W/H = 1200×675` 유지해 기본과 일치)
  - `GREETING_TEMPLATES`에 ratio 명시
  - **이중 정의 주의**: `apps/dashboard/src/types/member-greeting.ts`가 템플릿·스키마의 수동 복제본(파일 주석 명시됨) — 같이 갱신. utils 서브패스(`@sirubot/utils/memberGreeting`)는 이미 exports·tsup entry 등록됨 (package.json:45-48)
- Modify: `apps/data-api/src/renderers/memberGreetingCard.ts` — 고정 `CARD_W/H`(`:22-23`)를 `config.image.ratio` 기반 치수로. 레이어는 0~100 % 스케일(`GreetingLayer`), 배경은 cover-fit(`drawUploadedBackground:115-132`)이라 치수만 바꾸면 자동 대응. `GREETING_RENDER_SCALE` 2/3 유지
- Modify: 대시보드 편집기 — `components/servers/member-greeting/greeting-draw.ts:21-22`(CARD_W/H 상수 → ratio 기반), `greeting-image-editor.tsx`(비율 선택 UI + 미리보기), `hooks/use-member-greeting.ts`(draft에 ratio)
- Modify: 대시보드 API — `app/api/servers/[id]/greeting/route.ts`(PATCH zod), `greeting/test/route.ts`·`greeting/preview/route.ts` 경로 확인
- welcome/goodbye는 `GreetingPair`로 각각 독립 설정 자연 지원
- 검증: utils 테스트(스키마 기본값), `memberGreetingCard.test.ts` 치수 케이스 갱신, 대시보드 eslint+vitest, 1:1/16:9 업로드 이미지 수동 프리뷰

## PR 6 — 경고 시스템 + 자동 킥 + 관리 로그 (중간, Prisma)

**Goal**: warn 목록/해제 + N회 누적 자동 킥 + 관리 액션 로그

- Prisma (`packages/prisma/src/schema.prisma` + `yarn workspace @sirubot/prisma migrate:dev`):
  - `WarningRecord { id, guildId, userId, moderatorId, reason, createdAt, revokedAt? }` — `@@index([guildId, userId])`
  - `ModerationLog { id, guildId, kind /* warn|revoke|auto_kick|kick|timeout */, targetUserId, actorId, detail Json?, createdAt }` — `@@index([guildId, createdAt])`
  - `Guild`에 `warnKickThreshold Int?`(null=자동 킥 끔), `modLogChannelId String?` 추가
- Bot: `apps/bot/src/modules/general/commands/warn.ts` — `/경고 부여|목록|해제` 서브커맨드 + **신규 `ModerateMembers` precondition** (`general/preconditions/`, `sapphire-precondition` 스킬 로드 후 작성)
- Bot 서비스: `WarningService`(container에 등록) — 부여/해제/활성 목록/카운트. 부여 직후 임계 도달 시 자동 킥 시도 + `ModerationLog` 기록. 킥 실패(역할 위계) 시 로그 채널에 실패 안내
- Bot 로그 발송: `modLogChannelId` 설정 시 경고·해제·자동 킥을 CV2 임베드로 발송
- 대시보드: 서버 설정에 경고 패널 — 임계값·로그 채널 설정 + 최근 경고/로그 목록. 권한·zod·SWR 패턴은 `dashboard-conventions` 스킬, 단독 라우트 `/api/servers/[id]/moderation`
- 검증: `yarn generate`, service 단위 테스트(기존 Prisma mock 패턴 준용), lint/typecheck

## PR 7 — 역할 받기 패널 (중간)

**Goal**: 이모지/버튼 패널 게시 → 클릭으로 역할 지급/제거 토글

- Prisma: `RolePanel { id, guildId, channelId, messageId, title, entries Json /* [{roleId, emoji, label}] 최대 25 */, createdAt }`
- Bot: `general/commands/rolePanel.ts` — `/역할 패널생성|패널삭제` (슬래시 옵션 한계로 다얀트리 구성은 모달+버튼 단계형). 권한 `ManageRoles` 체크
- Bot: `general/interaction-handlers/rolePanel.ts` — customId `role:panel:{panelId}:{roleId}` 토글, 결과 ephemeral. 검증: 대상 역할이 봇 최상위보다 아래인지, 봇 통합 권한 소유 역할 차단, 패널·메시지 삭제 시 정리
- 버튼 5×5 = 최대 25개 제한 반영, 초과 시 에러 안내
- 멀티샤드: 역할 토글은 REST 호출이라 샤드 무관 — Redis 상태 불필요
- 대시보드: 이번 사이클은 봇 커맨드 중심, 대시보드 목록/편집은 다음 사이클
- 검증: 권한 위계 실패 케이스·핸들러 단위 테스트

## PR 8 — Sentry 체계 고도화 (중간, 3앱 + CI)

**Goal**: 캡처 표준화 + 대시보드 커버 + release/sourcemap 파이프라인. Discord 웹훅 알림은 제외

1. **봇 갭·표준화**
   - `apps/bot/src/core/sentry.ts`에 `captureBotError(error, { command?, component?, guildId?, userId? })` 헬퍼 추가 — 태그(`service`·`shard_ids`·`command`/`component`·`guild_id`)·interaction 컨텍스트 일원화
   - 3개 리스너 이관: `chatInputCommandError.ts`·`interactionHandlerError.ts`·`listenerError.ts` → 헬퍼 사용으로 표준 통일
   - 갭 메우기: `general/listeners/message/customCommandPrefix.ts` 등 접두사 실행 경로 예외 캡처 (커스텀 명령어 이름·길드 태그)
   - 원칙 유지: `UserError` 미캡처 (현행 계약), `container.logger` 병행
2. **대시보드 @sentry/nextjs** (Next 16)
   - `@sentry/nextjs` 추가, `instrumentation.ts`(`register()` 서버 init), `instrumentation-client.ts`(클라이언트), `app/global-error.tsx`
   - 시크릿 스크럽 재활용: `packages/utils/src/sentry.ts`의 `scrubSecrets`를 **`@sirubot/utils/sentryScrub` 서브패스로 분리** (대시보드는 루트 배럴 임포트가 eslint로 차단됨). `packages/utils/package.json` exports와 `tsup.config.ts` entry 동시 수정(AGENTS 규칙)
   - `service: 'dashboard'` 태그, `SENTRY_DSN`(서버)/`NEXT_PUBLIC_SENTRY_DSN`(클라) 분리
   - API Route 에러 경로(`handleApiError` 류)에 Sentry 훅 추가 — dashboard-conventions 스킬의 라우트 계약 준수
3. **release/sourcemap 파이프라인 (CI)**
   - `.github/workflows/docker-publish.yml`에 `VERSION=${{ github.sha }}` 빌드 인수 주입 (현재 release는 `process.env.VERSION` 사용 — `packages/utils/src/sentry.ts:31`)
   - Sentry release + sourcemap 업로드 스텝: 대시보드는 `@sentry/nextjs` 번들러 플러그인 빌드타임 업로드(docker secret 전달 설계 필요) vs CI `sentry-cli` 중 구현 시 결정
   - **필요 시크릿**: `SENTRY_AUTH_TOKEN`·`SENTRY_ORG`·`SENTRY_PROJECT`(서비스별 분리). 릴리즈 네이밍 `sirubot-<service>@<git sha>`
- 검증: 대시보드 eslint+vitest, utils subpath 빌드 후 `dist/sentryScrub.*` 확인, CI 업로드 스텝은 프로덕션 브랜치 조건부

## 보류 — 티켓 🎫

다음 사이클 별도 계획: 스레드 vs 채널, 패널 설정(카테고리·권한·로그 채널), 종료 시 트랜스크립트(`apps/storage` 활용 공개 링크) 설계부터.

---

## 실행 공통 사항

- **브랜치**: 각 PR은 `beta`에서 `feat/<주제>` 분기. PR 본문은 `docs/pr-message-rule.md` 준수 — 검증/미검증 명시, 대시보드 UI 변경은 스크린샷
- **린트**: 봇·packages는 prettier(`src/**/*.ts`), 대시보드는 eslint(`--max-warnings=0`). 탭·싱글쿼트·printWidth 150
- **명령어 등록**: PR 1·2·3·4·6·7은 슬래시 구조 변경 → `REGISTER_COMMANDS=true` 기동 또는 `yarn dlx tsx scripts/register-commands.ts --guild`로 확인
- **스킬 로드**: `sapphire-command`·`sapphire-precondition`(PR 1·2·6·7), `dashboard-conventions`·`design-tokens`·`ui-primitives`(PR 5·6 대시보드), `codebase-search`(탐색)
- **권장 순서**: PR 1 → PR 3 → PR 2 → PR 4 → PR 5 → PR 6 → PR 7(PR 6 migration과 묶어도 됨) → PR 8
