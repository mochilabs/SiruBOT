# 리팩토링 계획 (코드베이스 클린업)

> **문서 기준일**: 2026-10-20 · 브랜치 베이스: `beta`
> **조사 방법**: OpenCode 시맨틱 인덱스(8,108 chunks)의 `code_communities`/`call_graph`/`codebase_context`/`codebase_search` + 직접 소스 읽기로 확증. 인용은 `파일:라인` 형식이며 코드가 우선입니다.
> **성격**: 아이디어/우선순위 보고서. 실행 시 항목별로 별도 `refactor/*` 브랜치를 만들어 진행합니다(AGENTS.md 브랜치 규칙).
> **2026-10-20 결정**: 봇의 data-api 폴백(메모리 정리 스케줄러·오하아사 로컬 스크래핑/번역)은 유지하지 않고 **삭제** — data-api가 단일 책임을 가집니다(§2.1a·b).

## 목차

1. [TL;DR — 우선순위 요약](#1-tldr--우선순위-요약)
2. [크로스커팅 — 여러 워크스페이스에 걸친 중복 패턴](#2-크로스커팅--여러-워크스페이스에-걸친-중복-패턴)
3. [워크스페이스별 계획](#3-워크스페이스별-계획)
4. [의도적 중복 — 건드리지 않을 것들](#4-의도적-중복--건드리지-않을-것들)
5. [조사 중 발견한 잠재 버그](#5-조사-중-발견한-잠재-버그)
6. [문서 정합성 문제](#6-문서-정합성-문제)
7. [실행 로드맵 (리스크 낮은 순)](#7-실행-로드맵-리스크-낮은-순)

---

## 1. TL;DR — 우선순위 요약

| # | 대상 | 무엇을 | 근거 | 리스크 | 효과 |
|---|------|--------|------|--------|------|
| P0 | 봇 게이트웨이 폴백(메모리 tidy·오하아사) | **삭제 — 결정 완료, 실행만 남음** | 봇/data-api 이중 구현(§2.1a·b), 폴백 게이트는 제거 | 낮음(deletion-first) | 높음 |
| P0 | dashboard greeting 계약 복제본 2종 | 삭제 + `@sirubot/utils/memberGreeting` 서브패스 전환 | §2.1c 검증으로 "유지" 판정 폐기 | 낮음(turbopack 빌드가 게이트) | 중 |
| P0 | `apps/data-api/src/routes/index.ts` (1,103 LOC) | 도메인별 라우트 모듈로 분리 | `registerRoutes`가 651개 콜, 그래프 연결 652로 **리포 최대 허브** | 낮음(순수 이동) | 높음 |
| P0 | data-api 허브 3종 `PendingRequests` | 제네릭 공통 클래스로 통합 | 세 파일이 주석까지 같은 복사본 | 낮음 | 높음 |
| P1 | `apps/bot` `aiChatService.ts` (1,108 LOC) | 책임 7개를 파일별로 분리 | 아래 §3.2 구조표 참고 | 중(테스트 보강 선행) | 높음 |
| P1 | notifier 스케줄러 3종 | `PollingLoop` 공용 헬퍼 | 스켈레톤이 동일(아래 §2.4) | 낮음 | 중 |
| P1 | Fastify 인증/로거/env 4앱 중복 | `packages/utils`로 승격 | §2.2 (4벌 auth, 3벌 getLogger, 4벌 validateEnv) | 중(4앱 동시 변경) | 중 |
| P2 | `apps/bot` `trackHandler.ts` (889 LOC) | 이벤트/진행/워치독 관심사 분리 | 메서드 30+, 타이머 맵 3종 동시 관리 | 높음(상태기계) | 중 |
| P2 | dashboard API 라우트 래퍼 | `createGuildApiHandler` 도입 | 46개 라우트가 동일 진입 패턴 반복 | 낮음 | 중 |
| P2 | dashboard 대형 컴포넌트 | 섹션 단위 분리 | `design/page.tsx` 1,043, `greeting-image-editor.tsx` 837 등 | 중 | 중 |
| P3 | `packages/utils` 책임 경계 | `chatTools.ts` 도메인 분리 검토 | 한 파일에 4개 도메인(이모지/링크/embed-fix/OG 파싱) 혼재 | 중(임포터 다수) | 낮음 |

**규모 기준**(`wc -l`, 테스트 제외한 src): bot 30.8k(241파일) > dashboard 34.0k(269) > data-api 10.4k(63) > utils 5.2k(42) > notifier 3.0k(25) > shardmanager 1.3k(15) > storage 0.7k(13) > shardclient 0.5k(8).

---

## 2. 크로스커팅 — 여러 워크스페이스에 걸친 중복 패턴

### 2.1 크로스-앱 도메인 로직 이중 홈 — 최우선

봇이 data-api 소유의 외부 데이터/배치를 로컬 구현으로 한 번 더 들고 있는 구간들. **2026-10-20 결정: 폴백을 유지하지 않고 삭제 — data-api 단일 책임으로 통일**합니다.

**(a) 장기기억 정리(nightly tidy) 이중 구현 → 봇 쪽 삭제**

| 위치 | 내용 |
|---|---|
| `apps/bot/src/services/aiChatService.ts:551-669` | `TIDY_*` 상수/프롬프트 + `stripCodeFences`/`countMarkdownEntries`/`tidyOutputValid`/`tidyMemoryUser`/`startMemoryTidySchedule`/`scheduleNextTidy`/`runMemoryTidyBatch` + 상단의 aiMemoryService 헬퍼 임포트(:2) — data-api `services/memoryTidy.ts`(223 LOC)와 같은 로직의 병행 구현 |
| `apps/bot/src/modules/general/listeners/clientReady.ts:30-40` | `DATA_API_URL` 미설정 시에만 봇이 `startMemoryTidySchedule()`/`startOhaasaPrefetchSchedule()`을 돌리는 게이트(의도된 폴백) — **삭제 결정** |
| `apps/bot/src/services/aiMemoryService.ts:184-225` | `findTidyCandidates`/`countStoredEntries`/`markTidied` — 봇 tidy 배치 전용이라 함께 삭제 |

삭제 후 남는 것: 런타임 메모리(`buildPromptBlock`/`pushTurn`/`readFile`/`writeFile` 등)는 봇에 그대로 — **정리(배치)만 data-api 소유**. `UserMemory.tidiedAt` 컬럼은 data-api `memoryTidy.ts`가 Prisma로 직접 관리. 별개 항목으로 **마크다운 파서군 이중 홈**(`bot/services/aiMemoryService.ts:53-109` ↔ `data-api/services/memoryFile.ts:22-76`, 함수명 동일)은 양쪽 런타임이 계속 쓰므로 `packages/utils` 승격 후보(§3.6).

**(b) 오하아사 로컬 스크래핑/번역 폴백 → 삭제**

| 위치 | 내용 |
|---|---|
| `apps/bot/src/services/ohaasaTranslate.ts` | 봇 자체 LLM 번역 + 프리패치 스케줄러(~200 LOC) — 임포터가 `clientReady.ts` 하나뿐. 파일 전체 삭제 |
| `apps/bot/src/modules/games/commands/ohaasa.ts:91-104` | `fetchOhaasaKo()`(게이트웨이) 실패 시 로컬 `fetchOhaasa()`로 폴백하는 이중 try → 단일 게이트웨이 호출 + `UserError`로 단순화 |
| `apps/bot/src/modules/games/utils/ohaasaService.ts:19-32,:69-218` | `TVASAHI_ZODIAC_MAP`/`parseRanking`/`parseTVAsahiHTML`/`fetchWeekendHoroscope`/`parseHoroscopeText`/`fetchOhaasa`/캐시 변수 + `container` 임포트 — data-api `providers/ohaasa.ts`의 복제본. **유지**: `ZODIAC_MAP`/`ZODIAC_CHOICES`/`getZodiacFromDate`/`HoroscopeData`/`DailyHoroscope`(profile·aiTools·카드 페이로드·게이트웨이 응답 타입이 의존) |

참고: 날씨/배송/가사/유튜브 챕터/카드 렌더는 이미 게이트웨이 전용(`weather.ts:164`, `delivery.ts:88`은 게이트웨이 호출 + `GatewayDomainError` 매핑만, 봇 `weatherService.ts`/`deliveryService.ts`에는 타입·에러 클래스만 잔존). `dataApiClient.gatewayGet`은 `DATA_API_URL` 미설정 시 `Error('data-api disabled')`로 하드 실패하므로 삭제 후에도 조용한 오동작은 없습니다. 문서 동기화: `docs/architecture.md:88` "없으면 봇이 외부 제공자를 직접 호출" 규칙 문구는 실행 PR에서 함께 수정.

**(c) 멤버 인사(greeting) 계약 3중 관리 → 서브패스 임포트로 단일화**

재검증 결과 기존 §4-1의 "유지" 판정은 stale이었습니다:
- `packages/utils/src/memberGreeting.ts`는 `zod`만 임포트하는 순수 모듈이고 `./memberGreeting` 서브패스 export가 `package.json` exports 맵에 존재.
- 빌드 문제의 진짜 원인은 배럴(`index.ts`)이 `redisSubscriber.js`(@redis/client)·`logger.js`(tslog)·`appEmoji.js`를 함께 export한다는 것 — **서브패스는 해당 없음**.
- 대시보드 클라이언트 컴포넌트가 이미 `@sirubot/utils/customCommand`(custom-command-editor.tsx 등)와 `@sirubot/utils/time`(track.tsx)을 런타임 임포트해 동작 중이고, `types/member-greeting.ts:14`도 같은 서브패스 타입 임포트 사용 중.

> 제안: `lib/greeting-schema.ts`(zod 복제본) 삭제 + `types/member-greeting.ts`의 값 상수를 `@sirubot/utils/memberGreeting` 임포트로 교체 → `yarn workspace @sirubot/dashboard build`(--turbopack) 통과로 검증. 실패 시 근본 치료는 배럴의 코어/노드 전용 분리.

**(d) 소규모 복제 일괄**

- `sleep(ms)` 7곳: bot bootstrap.ts:12 / aiChatService.ts:629((a) 실행 시 함께 소거) / ttsService.ts:100 / customCommands/interpreter.ts:90 / general/commands/help.ts:25, data-api memoryTidy.ts:69, dashboard lib/token-store.ts:314 → `packages/utils`에 `sleep` 추가 후 교체.
- 시간 포맷 이원화: `packages/utils/src/time.ts`(formatTime/formatTimeToKorean) ↔ `dashboard/src/lib/format.ts`(formatUptime/formatRelativeTime/formatDuration/formatMemory) — dashboard `track.tsx`가 이미 `@sirubot/utils/time` 사용 중. time을 단일 홈으로, format.ts는 대시보드 전용(상대시간/바이트)만 남기는 방향.
- fetch 타임아웃 래퍼: `AbortSignal.timeout`/`AbortController` 사용 26 파일 산재 — 초소형 `httpGetJson(url, {timeoutMs})` 점진 도입 후보(우선순위 낮음).
- 에러 클래스 이중 정의: `WeatherError`(bot weatherService.ts:11 ↔ data-api providers/weather.ts:11), `DeliveryError`(bot deliveryService.ts:9 ↔ data-api providers/delivery.ts:4) — 봇 쪽은 게이트웨이 응답 매핑용이라 dataApiClient 공통 매퍼로 흡수 검토(우선순위 낮음).

### 2.2 Fastify 앱 공용 인프라 4벌 — `packages/utils` 승격 후보

data-api · shardmanager · storage · notifier 네 앱이 같은 밑바닥 코드를 각자 갖고 있습니다.

**(a) 인증 플러그인 4벌** — 계약은 동일(Authorization 헤더에 키 원문, Bearer 없음, timing-safe 비교, fail-closed)인데 구현이 두 스타일로 나뉘어 각각 복제됐어요:

- 글로벌 훅 스타일: `apps/data-api/src/plugins/auth.ts` vs `apps/shardmanager/src/plugins/auth.ts` — `safeEqual`(sha256 + `timingSafeEqual`)+ excluded 경로 `/api/health` + 키 없으면 `process.exit(1)`. 주석 문구까지 거의 동일.
- 라우트 레벨 스타일: `apps/storage/src/plugins/auth.ts` vs `apps/notifier/src/plugins/auth.ts` — `requireAuth(key): preHandlerAsyncHookHandler`, 에러 메시지 문자열만 "storage"/"notifier"로 바뀐 사본.

> 제안: `@sirubot/utils`(또는 신규 `@sirubot/fastify-kit`)에 `timingSafeKeyEqual(a,b)` 유틸 + `createKeyAuthHook({ key, appName, excludePaths })` / `createKeyPreHandler({ key, appName })` 두 팩토리. storage/notifier는 한 줄로, data-api/shardmanager는 훅 한 줄로 대체. 단, fastify를 utils의 dependencies로 올려야 하므로 **peer dependency 또는 별도 패키지**가 안전합니다.

**(b) `getLogger(name)` 3벌** — `apps/data-api/src/utils/logger.ts:4`, `apps/shardmanager/src/utils/logger.ts:6`, `apps/notifier/src/utils/logger.ts:5` 전부 `createLogger('<AppName>').getSubLogger({ name })` 한 줄짜리 래퍼(지연 초기화 여부만 미세 차이). `packages/utils/src/logger.ts:32`의 `createLogger`가 원조.
> 제안: `packages/utils`에 `getAppLogger(appName)`(앱명 → 서브로거 팩토리) 추가, 3앱의 `utils/logger.ts`는 재수출 스텁으로 전환 후 삭제.

**(c) `validateEnv()` + AUTH_KEY 폴백 체인 4벌** — 4개 `config/env.ts`가 동일한 `safeParse → console.error(zod format) → process.exit(1)`이고, `DATA_API_AUTH_KEY ?? AUTH_KEY`(`apps/data-api/src/config/env.ts:32`)、`STORAGE_AUTH_KEY ?? AUTH_KEY`(storage)、`NOTIFIER_AUTH_KEY ?? AUTH_KEY`(notifier `.transform`) 폴백이 세 번 반복.
> 제안: `parseEnvOrExit(schema)`와 `authKeyChain(primary, shared)` 헬퍼. 각 앱 스키마는 zod 정의만 남기고 10줄 안쪽으로 축소.

### 2.3 Redis request/reply "pending map" 패턴 4벌

대시보드/외부 → Redis → 봇 응답 상관(correlation) 로직이 네 번 구현됐어요:

- `apps/data-api/src/services/guildDataHub.ts:52` — `GuildDataPendingRequests`
- `apps/data-api/src/services/jtcSetupHub.ts:42` — `JtcSetupPendingRequests`
- `apps/data-api/src/services/playerWebHub.ts:63` — `PlayerWebPendingRequests`

셋은 "동시 대기 요청 상한 — 응답을 못 받는 요청이 pending map에 쌓이는 누수를 방지해요" 같은 주석까지 같은 복사본입니다(capacity 체크 → 즉시 실패 resolve, `setTimeout` 타임아웃, `handleRaw`, `*HubStatus` 상태 함수).

- `apps/notifier/src/services/webhookHub.ts` — `SocialWebhookHub`도 같은 아이디어(PENDING_LIMIT 200, REQUEST_TIMEOUT 5s는 "guildDataHub와 동일"이라 주석에 명시)를 자체 `Map` + `ensureSubscription`으로 재구현.

> 제안: `packages/utils`에 `PendingRequestPool<TPayload>({ capacity, logger, onTimeout })` — `register(id, timeoutMs): Promise`, `resolve(id, payload): boolean`, `fail(id, reason)`, `size`. data-api 3허브 + notifier 1곳을 순서대로 갈아끼우고, 각 허브에는 채널명·직렬화·타임아웃 매핑(`KIND_TIMEOUT_MS`) 같은 도메인 차이만 남깁니다. `redisEnvelope` 서명 로직은 이미 공용(`@sirubot/utils/redisEnvelope`)이라 그 위에 올리면 자연스럽습니다.

### 2.4 Redis 구독 라이프사이클 3벌

- `packages/utils/src/redisSubscriber.ts` — `ManagedRedisSubscriber`(봇 responder 7종 전부 채택 확인: botProfileService/guildDataResponder/guildSettingsInvalidator/jtcSetupResponder/memberGreetingService/playerWebResponder/socialWebhookResponder). 다채널 바인딩 + 자체 백오프(5s→60s).
- `apps/data-api/src/utils/hubSubscriber.ts` — `HubSubscriber`(data-api 6개 허브). 패턴 구독(pSubscribe) + `isSubscribed` 래치 + 클라이언트 자동 재구독 위임.
- `apps/notifier/src/services/webhookHub.ts` — inline `ensureSubscription`(재시도 로직 없음, 요청 시점 재시도).

> 제안(보수적으로): data-api의 `pattern` 구독과 상태 래치는 실제 차이이므로 단일 클래스에 억지 통합하지 않습니다. 단기: ① notifier를 `ManagedRedisSubscriber`로 전환(가장 얇음). 장기: `ManagedRedisSubscriber`에 `pattern?: boolean`과 `isSubscribed` getter 옵션을 추가해 data-api `HubSubscriber`를 흡수 가능한지 검증(문서의 채널 계약이 단일 소스이므로 실현 가능성 높음). 구독 계층은 장애 복구 경로라 **변경 시 Redis 단절 시나리오 테스트 필수**입니다.

### 2.5 폴링 스케줄러 루프 3벌 (notifier)

`apps/notifier/src/services/youtubeScheduler.ts:38,75` · `twitchScheduler.ts:27,61` · `chzzkPoller.ts:40,75` — `timer` 필드, `scheduleNext(){ this.timer = setTimeout(() => void this.tick(), TICK_MS) }`, `start/stop` 스켈레톤이 세 파일에 동일(각 30~50줄). 실제 도메인은 "구독 목록 조회 → 플랫폼별 상태 확인 → 이벤트 기록 → 알림 발행"으로 같은 형태의 tick 본문.

> 제안: notifier 내부에 `PollingLoop`(interval, 즉시 tick 여부, 에러 시 계속/중단 정책) 헬퍼 하나 + `SubscriptionPoller` 추상(조회/판정/발행 훅). 세 스케줄러는 훅 구현만 남습니다. dispatcher 이벤트 기록 로직도 함께 묶이는지 검토.

---

## 3. 워크스페이스별 계획

### 3.1 `apps/data-api` — 최우선

**(P0) `routes/index.ts` 1,103 LOC 모놀리스 분리.** `call_graph` 기준 `registerRoutes`가 651개 함수를 직접 호출하고 그래프 연결 652로 리포 최대 허브(`architecture_context` 결과). 파일 안에 라우트 핸들러 + 인라인 zod 스키마 + SSE 브로드캐스트 + Redis publish가 섞여 있습니다. 이미 `routes/dashboard.ts`, `routes/social.ts`로 추출한 선례가 있으므로 같은 패턴으로 이어가면 됩니다.

도메인별 분리안(현재 import 목록 기준):

| 신규 파일 | 옮길 것 | 키 심볼 |
|---|---|---|
| `routes/ohaasa.ts` | 오하아사 캐시 서빙 + 수동 갱신 | `serveCached`, `refreshOhaasaNow`, `ohaasaCacheKey` |
| `routes/embed-fix.ts` | POST embed-fix 메타데이터 (x/instagram/booth/og 팬아웃) | `embedFixCacheKey`, `swapEmbedFixUrl` |
| `routes/cache-providers.ts` | lyrics / weather / delivery / youtube-chapters | 각 `*CacheKey` + `fetch*` |
| `routes/render.ts` | 프로필 카드( dark/ticket ), 인사 카드, now-playing, ohaasa 카드 + 이미지 normalize | `deduped`, `render*Card`, 각 페이로드 zod 스키마 |
| `routes/ai.ts` | custom-command-draft / refine | `generateCustomCommandDraft/Refine` |
| `routes/player.ts` | 플레이어 상태/SSE/웹 제어 프록시 | `getPlayerState`, `subscribeSse`, `requestPlayerWeb` |
| `routes/guild-data.ts` | 길드 채널/역할/멤버 프록시 + jtcSetup + botProfile + memberGreeting 발행 | `requestGuildData`, `wrapRedisMessage` |

`index.ts`에는 헬스/스테이터스 + 각 모듈 `register*` 호출만 남깁니다. 인라인 zod 스키마(파일 중반의 대형 custom-command/profile 스키마 블록)는 해당 도메인 파일로 함께 이동. **계약(경로·페이로드) 불변이므로 순수 파일 이동 + data-api 테스트(`serveCached.test.ts` 등 15파일)로 회귀 확인**하면 됩니다.

**(P1) 허브 중복 제거** — §2.3.

**잘 되어 있는 것(유지)**: `utils/`의 `serveCached`/`dedup`/`breaker`/`cache`/`metrics` 추상, `renderers/canvasUtils.ts`(582 LOC)에 폰트 로딩·이미지 allowlist·truncate·RNG·아이콘·hexToRgba가 잘 중앙화됨(각 렌더러가 공유 확인).

### 3.2 `apps/bot` — 큰 서비스 2개부터

**(P1) `services/aiChatService.ts` 1,108 LOC — 책임 7개 분리.** 심볼 맵 기준 실제 구성:

| 책임 | 심볼 위치(예) | 분리안 |
|---|---|---|
| 설정/정책 | `getChatConfig`(:118), `getAiChatPolicy`(:143) | `services/aiChat/config.ts` |
| 토큰 추정 | `estimateTokens`(:29), `getContextTokenBudget`(:36) | `aiChat/tokenBudget.ts` |
| 채널 히스토리 스토어 | `channelHistories` Map(:172) + load/persist/trim/clear/수정(:178~399) | `aiChat/historyStore.ts` |
| 시스템 프롬프트 조립 | `SYSTEM_PROMPT`(:89), `buildSystemContent`(:441), `buildRecentChannelBlock`(:409) | `aiChat/prompt.ts` |
| 롤링 요약 | `scheduleSummary`, `runSummaryJob`(:510~568) | `aiChat/summarizer.ts` |
| 메모리 정리 스케줄러 | `tidyMemoryUser`(:591), `startMemoryTidySchedule`(:634), `runMemoryTidyBatch`(:650) | **추출하지 않고 삭제 — §2.1a 결정** |
| 턴 제어/중단 | `acquireChannelTurn`(:688), `tryConsumeUserTurn`(:709), `registerChatAbort` 등(:719~733) | `aiChat/turnControl.ts` |
| agent 루프/스트리밍 | `streamChatCompletion`(:837), `runChatTurn`(:993), `extractThinkTokens`(:745), `finalizeText`(:769) | `aiChat/agentLoop.ts` |

주의: 이 파일은 프로세스 전역 상태(`channelHistories`, `channelGuilds` 등 Map 3종)를 들고 있어 **순서를 지켜야** 합니다 — ① 테스트 보강(아래 §5 버그와 함께), ② 상태 스토어(`historyStore`)부터 추출, ③ 순수 함수(prompt/tokenBudget) 추출, ④ 마지막에 agent loop. 기존 `services/aiTools/`, `aiChat/*.test.ts` 패턴과 일치.

**(P2) `modules/audio/lavalink/handlers/trackHandler.ts` 889 LOC.** `TrackHandler` 한 클래스가 시작(:71)·종료(:142)·TTS 이어가기(:198,:239)·stuck(:249)·error(:253)·queueEnd(:337)·destroy(:497)·워치독(:716,791)·reconcile(:651)·서버 트랙 프로브(:699,711)·advance-pending(:799,842)을 관리하고, 타이머 맵을 3종(`watchdogs`:48, `reconcileTimers`:50, `clientAdvancePending`:56) 개별 관리합니다. 분리안:

- `trackStartOrchestrator` — handleTrackStart + `runMixerWiring`(:120) + TTS 이어가기
- `queueAdvancer` — handleTrackEnd/Failure/QueueEnd + `finishQueue` + advance-pending 맵
- `playbackWatchdog` — armWatchdog 류 + reconcileNowPlaying + 서버 프로브 + 타이머 맵 일원화

`trackHandler.test.ts`(396 LOC)가 있으니 **세 클래스의 공개 계약을 먼저 테스트로 고정하고** 분해하세요(현재 가장 리스크 큰 항목).

**(유지) 이미 좋은 것**: preconditions 8종, view/ 10종, responder 7종의 `ManagedRedisSubscriber` 공용화, `pendingWriteStore`의 abstract getKey 패턴.

### 3.3 `apps/dashboard`

현 상태: API 공용기(`lib/api-guards.ts`의 `authorizeGuildManage/Member` + `denied*`, `lib/rate-limit.ts`의 `guardRateLimit`, `lib/schemas.ts`의 `zodError`)는 이미 잘 추상화돼 있습니다(46개 라우트 중 인가 28, 레이트리밋 38, zod 28 사용).

**(P1) greeting 계약 복제본 제거** — §2.1c. `lib/greeting-schema.ts` 삭제 + `types/member-greeting.ts` 값 상수를 `@sirubot/utils/memberGreeting` 임포트로 교체. turbopack 빌드 통과가 검증 게이트.

**(P2) 라우트 진입 패턴 래퍼.** 각 route.ts가 `인가 → denied → rate limit → zod parse → 본문 → catch(toError)`를 반복. `createGuildApiHandler({ role: 'manage' | 'member', rate: WRITE_RATE, schema?, handler })` 한 겹을 얹으면 라우트당 15~30줄 절감 + 인가/레이트리밋 적용 누락(현재 인가 없이 rate만 단 라우트가 있는지 점검)을 타입으로 방지. 점진 도입(신규 라우트부터) 가능.

**(P2) 대형 컴포넌트 분리** (기능 덩어리별):
- `app/design/page.tsx` 1,043 — 디자인 시스템 쇼케이스(내부 도구). 섹션별 `_sections/*.tsx`로 쪼개면 diff 리뷰가 쉬워짐. 우선순위는 낮음(사용자 노출 아님).
- `components/servers/member-greeting/greeting-image-editor.tsx` 837 — 이미 `layer-panel.tsx`/`layer-properties.tsx` 분리 중. 캔버스 프리뷰·업로드/프리셋 영역을 추가 분리.
- `player/player-live-tab.tsx` 628, `servers/member-greeting-settings.tsx` 587, `servers/custom-command-editor.tsx` 581, `servers/custom-command-steps-editor.tsx` 499 — 에디터 3부작(custom-command-*)은 공통 "스텝 리스트 편집" 패턴이 있으면 hooks 추출 검토.

**(P3) 데이터 훅 공통화.** `use-playlists.ts`(343) 등 훅 6개가 `useSession → useSessionExpiredRedirect → 조건부 SWR key(null이면 pause) → useToast 에러`를 반복. `useAuthedSWR<T>(key)` + `useGuildResource<T>(guildId, path)` 두 개로 상당부분 흡수 가능. 글로벌 SWR fetcher 등록 위치(`lib/fetcher.ts`는 본체만 있음)를 확인해 `SWRConfig` 기본값과 중복 지정이 없는지 함께 정리.

### 3.4 `apps/notifier`

- (P1) 스케줄러 3종 통합 — §2.5.
- (P2) `webhookHub.ts`를 공통 PendingRequestPool로 — §2.3. `ensureSubscription`은 §2.4에 따라 `ManagedRedisSubscriber` 전환 검토.
- 잘된 것 유지: `twitchApi`/`chzzkApi`의 `FetchFn` DI 주입(테스트 용이), 라우트 도메인 분리(social/pubsub/eventsub/health).

### 3.5 `apps/storage` · `apps/shardmanager`

둘 다 작고(661 / 1,259 LOC) 라우트·서비스 분리와 테스트(`objects.*.test.ts`, `shardRegistry.test.ts`)가 있음. **구조 변경 없음** — §2.2 공용 인프라 승격에 편승해 auth/logger/env만 교체.

### 3.6 `packages/utils` · `packages/shardclient` · `packages/prisma`

- (P3) `packages/utils/src/chatTools.ts`(546 LOC, 그래프 연결 255인 허브)가 **서로 다른 도메인 4개**(이모지 확대 `:15~49`, 메시지 링크 파싱 `:49~79`, embed-fix 링크 파싱/스왑 `:80~273`, OG 메타/`parseOgMeta`/FxTwitter `:274~`)를 한 파일에 담고 있음. `chat/emoji.ts`, `chat/messageLinks.ts`, `embedFix/parse.ts`, `embedFix/ogMeta.ts`로 나누고 배럴(`index.ts`) 재수출로 하위호환 유지. 임포터가 많아 영향도가 넓어 **마지막 우선순위**.
- 배럴 vs 서브패스 기준 정리: 현재 `@sirubot/utils`(배럴)와 `@sirubot/utils/redisEnvelope`(서브패스) 혼재. 배럴은 대시보드에서 번들 사이드이펙트 문제가 있었으므로(§4) "Node 전용 의존이 있는 모듈은 서브패스 export만" 규칙을 README/AGENTS에 명문화 제안.
- `packages/shardclient`(536 LOC), `packages/prisma`(스키마+마이그레이션만)는 단일 책임으로 건강함.

---

## 4. 의도적 중복 — 건드리지 않을 것들

복제처럼 보이지만 이유가 있는 것들. 리팩토링 범위에서 제외하고, 대신 가드만 추가합니다.

1. **(폐기 — §2.1c로 이동) `apps/dashboard/src/lib/greeting-schema.ts` ↔ `packages/utils/src/memberGreeting.ts`** — "utils 배럴 임포트 시 빌드 실패" 주석의 전제(배럴 문제)가 서브패스에는 적용되지 않음이 검증돼 **삭제 항목으로 전환**됐습니다.
2. **`bot/services/dataApiClient.ts` ↔ `dashboard/lib/data-api.ts`(506 LOC)** — 둘 다 data-api HTTP 클라이언트지만 런타임·호출 표면이 다름(봇: Node 풀타임 서비스 / 대시보드: Next 서버에서 `NextResponse` 변환). 단일화 시도는 득보다 해가 큼. 경로 상수화 정도만 고려.
3. **봇 7 responder의 Redis 구독** — 이미 `ManagedRedisSubscriber`로 공용화됨(§2.4). "중복"이 아니라 채택 완료 상태.
4. **`chatTools.test.ts`/`social.test.ts` 등 대형 테스트 파일** — 소스와 1:1 대응, 분리 불필요.

---

## 5. 조사 중 발견한 잠재 버그

리팩토링은 아니지만 조사 중 발견 — 분리 작업 전에 확인 권장:

1. **`aiChatService.ts:83-84` — `REASON_OPEN`과 `REASON_CLOSE`가 둘 다 `'</think>'`** (두 상수가 동일한 문자열). `extractThinkTokens`(:745)는 OPEN→토글→CLOSE 순으로 찾는데, 일반적인 모델 출력은 `<think>...</think>`이므로 OPEN이 `'<think>'`이어야 자연스러워 보입니다. 현재 값이면 실제 출력에서 reasoning 블록이 거꾸로 처리될 가능성. `aiChatService.test.ts`(78 LOC)는 `thinkToken: false`만 써서 **이 경로는 미커버** → 실제 LLM 출력 샘플로 확인 후 상수 수정 + `extractThinkTokens` 단위 테스트 추가.
2. (확인 과제) 대시보드 API 라우트 중 **인가 없이 rate-limit만 적용된 라우트가 있는지** 전수 확인(46개 라우트, 인가 28 / rate 38 — 조합 매트릭스를 표로 정리하면 보안 구멍 탐지에도 도움). 보안 도메인이므로 `security-audit` 워크플로에 넘기는 것도 방법.

---

## 6. 문서 정합성 문제

- **AGENTS.md** 워크스페이스 표에 `apps/notifier`, `apps/storage`가 없습니다(본문에 storage 언급만). 실제 워크스페이스는 앱 6 + 패키지 3. 테스트 집계 문구("bot ×27 … shardmanager ×1")에도 notifier ×6이 빠져 있습니다.
- **docs/architecture.md** 도 "4개의 독립 프로세스 앱과 3개의 공유 패키지"(:26)라 서술 — 코드(6앱)보다 오래됨.
- 리팩토링 커밋과 별개로, 위 두 문서에 notifier(포트 3004 추정 — `apps/notifier/src/config/env.ts:3` PORT 기본 3004)/storage(3003)를 추가하는 문서 PR을 선행하면 이후 작업의 기준이 정확해집니다.

---

## 7. 실행 로드맵 (리스크 낮은 순)

각 단계는 별도 브랜치/PR. `yarn lint && yarn typecheck && yarn test`(CI와 동일) 통과가 완료 조건이며, Turbo가 의존 패키지를 재빌드하므로 패키지 변경(`packages/*`) 단계는 앱 변경보다 한 단계씩 앞서는 게 안전합니다.

| 단계 | 내용 | 사전 조건 |
|---|---|---|
| 1 | 문서 정합성(§6) + §5-1 `REASON_OPEN` 확인/테스트 | 실제 LLM 출력 샘플 확보 |
| 2 | **봇 게이트웨이 폴백 삭제**(§2.1a·b — tidy 블록/게이트/ohaasaTranslate/로컬 스크래핑 군, `aiMemoryService` tidy 전용 메서드 3종) + greeting 서브패스 전환(§2.1c) + `sleep` 공용화(§2.1d) | 없음(deletion-first). 완료 조건에 `yarn workspace @sirubot/dashboard build`(turbopack) 포함, `docs/architecture.md:88` 문구 동기화 |
| 3 | notifier: `PollingLoop` 헬퍼 + 스케줄러 3종 교체, webhookHub→`ManagedRedisSubscriber`/PendingRequestPool | utils에 `PendingRequestPool` 추가(테스트 포함) |
| 4 | data-api 허브 3종 → `PendingRequestPool` 교체 | 단계 3의 풀 검증 |
| 5 | data-api `routes/index.ts` 도메인 분리(§3.1 표대로) | 없음(순수 이동). 라우트 표 골격 테스트 가능 |
| 6 | Fastify 공용(auth/logger/env) `packages/utils`(또는 fastify-kit) 승격 → 4앱 교체 | fastify 의존성 배치 결정(peer vs 신규 패키지) |
| 7 | dashboard `createGuildApiHandler` 도입 + 신규 라우트부터 적용 | 인가/레이트리밋 적용 매트릭스 표 작성(§5-2) |
| 8 | bot `aiChatService` 추출(히스토리 스토어 → 순수 함수 → 루프 순) | 단계 2 선행(tidy 블록 소거 후 분리), 회귀 테스트 보강(§5-1 커버 포함) |
| 9 | bot `trackHandler` 3분할 | 공개 계약 테스트 고정(trackHandler.test 확장) |
| 10 | dashboard 대형 컴포넌트·훅 정리, `chatTools.ts` 분리 검토, 메모리 마크다운 파서 `packages/utils` 승격(§2.1a 후속) | 7·8 선행으로 패턴 안정 |

**측정 지표(진행 전/후 비교용)**: `registerRoutes` callee 수(651 → 목표 <50), src 최대 파일 LOC(1,108 → 목표 <500), PendingRequests 구현 수(4 → 1), 스케줄러 루프 스켈레톤 수(3 → 1), `getLogger` 팩토리 수(4 → 1), 봇의 외부 프로바이더 직접 호출 도메인 수(운세·메모리 배치 → 0), `sleep` 구현 수(7 → 1).

---

## 부록 — 재현 가능한 조사 방법

- 인덱스 상태: `index_status`(8,108 chunks, ollama/nomic-embed-text, 2026-10-20 기준 ready)
- 허브/커뮤니티: `code_communities`(minSize 3, hubThreshold 5), `architecture_context`(depth 3)
- 허브 검증: `call_graph registerRoutes callees` → 651
- 중복 검증: 각 §의 인용 파일을 직접 diff/read로 대조(auth 4파일, 로거 3파일, env 4파일, 허브 pending 클래스 3파일 + notifier 1파일, 스케줄러 3파일)
- 크로스-앱 검증(2026-10-20 보강): `clientReady.ts:36-39`의 `DATA_API_URL` 폴백 게이트, `dataApiClient.gatewayGet`의 `Error('data-api disabled')` 하드 실패, `packages/utils/package.json` exports 맵의 `./memberGreeting` 서브패스, 대시보드 클라이언트의 서브패스 런타임 임포트 사례(custom-command-editor/track.tsx), weather/delivery 커맨드의 게이트웨이 전용 확인(로컬 폴백 없음), 삭제 대상 심볼의 테스트 미참조 확인
- 크기 기준: `find apps packages -path '*/src/*' \( -name '*.ts' -o -name '*.tsx' \) | xargs wc -l | sort -rn`

**미검증 항목**: §3.1 분리안의 라우트-도메인 매핑 세부(파일 전체 미정독, import/심볼 수준으로 유추), §2.1c 전환 후 turbopack 빌드 실측(시도 전까진 가설), §4-2 경로 상수화의 실익, 대시보드 `SWRConfig` 글로벌 fetcher 등록 위치.
