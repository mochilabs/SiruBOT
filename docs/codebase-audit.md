# 코드베이스 감사 리포트 (2026-10-21)

> **기준**: `refactor/codebase-cleanup` 브랜치 (PR #125 반영 최신 상태) — 메인 체크아웃 beta가 아님
> **방법**: 감사원 8명 병렬 전수 (`/tmp/opencode/audit/` 원본 리포트 8개 — /tmp는 휘발이므로 본 문서가 권위 소스)
> **울타리**: 무수정·발견-보고 전용. PR #125에서 이미 수정한 항목(chatTools·trackHandler·aiChatService 분할, app-kit, API 가드, SWR 훅, greeting 서브패스, think 토큰 버그 등)은 제외
> **표기 규칙**: 모든 발견에 `경로:라인` 인용 필수. 심각도 = high(실버그·보안·데이터 손실) / med(유지보수 장애·중복 비용) / low(미관·일관성)

**총 154건** (high 8 / med ~55 / low ~91) — deslop-bot 29, typos 31, structure 18, deslop-dashboard 28, bugs 14, deslop-infra 18, deslop-packages 30+, dup-cross 17.

---

## 1. P0: 즉시 조치 (보안·장애 직접)

| # | 항목 | 위치 | 요약 |
|---|---|---|---|
| 1 | **소셜 구독 IDOR** | `apps/dashboard/src/app/api/servers/[id]/social/subscriptions/[subId]/route.ts:34-87`, `apps/notifier/src/routes/social.ts:153-206` | `[id]` 길드 관리자만 검증하고 subId의 길드 소유권 미검증 → 길드 A 관리자가 길드 B 구독·웹훅을 PATCH/DELETE 가능. 생성/목록만 스코프 검증됨 |
| 2 | **전이 실패 시 무음 정체** | `apps/bot/src/modules/audio/lavalink/handlers/queueAdvancer.ts:394-408` (호출부 94-98/266-269, `trackStartOrchestrator.ts:125,140`) | 클라이언트 소유 전이에서 play() reject 시 watchdog 미장착 → 복구 타이머 없이 재생 이벤트도 없음. 길드 무음 정체 |
| 3 | **fresh 세션 복구 지연** | `apps/bot/src/modules/audio/lavalink/handlers/nodeHandler.ts:335-395`, `apps/bot/src/services/playerSaver.ts:44-59` | 레플리카 무관 전체 키 스캔 + 외부 길드마다 90초 폴링을 배치(10개) 순차 대기 → 다중 레플리카+fresh 세션(resumed=false)에서 자국 길드 복구가 수 분~수십 분 지연. 6h 신선도 한도 밖으로 밀리면 복구 기회 영구 상실 |
| 4 | **notifier 500 완전 무음** | `apps/notifier/src/routes/social.ts:58-70`, `apps/notifier/src/server.ts:17` (`logger:false`) | 보호 라우트 8개의 에러가 no-op 로거로 유실. Sentry/앱 로거 미도입 → 장애 시 원인 파악 불가. `getLogger` + `initSentry` 필요 |
| 5 | **state 허브 HMAC 미검증** | `apps/data-api/src/services/hubs/playerHub.ts:72-106`, `botProfileHub.ts:95-116`, `memberGreetingHub.ts:83` | SEC-006 fail-open과 불일치. Redis 쓰기 권한이면 위조 상태가 대시보드 SSE로 중계됨 |
| 6 | **인가 게이트 무테스트** | `apps/dashboard/src/lib/api-guards.ts:18-114`, `admin-ids.ts:28-31` | 401/403/502 3상태 분기와 fail-closed allowlist(`DASHBOARD_ADMIN_IDS` 미설정=전원 차단)에 테스트 0. `api-handler.test.ts:125-153`은 mock으로 게이트를 우회해 라우팅만 검증 |

## 2. P1: 계약 붕괴 위험 (구조)

| # | 항목 | 위치 | 요약 |
|---|---|---|---|
| 7 | utils 루트 배럴 node 전용 노출 | `packages/utils/src/index.ts:4,6,8,9,15,16,17` | version.ts(child_process)·appEmoji.ts(node:fs)·redisSubscriber.ts(@redis/client)·youtube.ts(undici)·embed.ts(discord.js)·logger.ts(tslog) 노출 → "use client"가 루트 임포트하면 번들 붕괴. 현재 대시보드 루트 사용 4곳은 서버라 우연히 통과. `next.config.ts:11-15`에 discord.js 빌드 깨진 기록 존재. 클라이언트 안전 서브패스 분리 + eslint 루트 임포트 금지 |
| 8 | `./playerWeb`·`./storage` 서브패스 부재 | `packages/utils/package.json:6-56` (exports 10개에 없음) | 대시보드가 강제로 루트 배럴 사용: `api/servers/[id]/player/play/route.ts:2`, `lib/storage.ts:1` |
| 9 | 인사 카드 렌더링 95% 복제 | `apps/data-api/src/renderers/memberGreetingCard.ts:31-35,92-113` ↔ `apps/dashboard/src/lib/greeting-draw.ts:23-38,104-127` | 프리셋 hex 12값·drawPresetBackground·스크림 색·hexToRgba까지 동일. 브랜드 색 갈라지면 시각적 계약 파손 |
| 10 | 길드 설정 30키 계약 5곳 독립 선언 | `apps/dashboard/src/app/api/servers/[id]/settings/route.ts:11-43`(`ALLOWED_KEYS`)·`:47-72`(타입 손복사)·`:73-142`(기본값), `types/settings.ts:16-46`, `lib/schemas.ts:26-71` | ALLOWED_KEYS↔zod가 어긋나면 `parseSettingBody`(`lib/schemas.ts:103-112`)가 유효 필드를 거부하거나 미등록 키를 통과시킴. `Object.keys(guildSettingsSchema.shape)` + Prisma 타입으로 단일화 |
| 11 | 날씨 49줄·택배 29줄 바이트 동일 복제 | `apps/bot/src/modules/general/utils/weatherService.ts:9-57` ↔ `apps/data-api/src/providers/weather.ts:9-57` / `deliveryService.ts:11-45` ↔ `delivery.ts:4-34,110-112` | WeatherScope/WeatherError/DailyForecastDay/AirQualityInfo/WeatherResult, 택배 인터페이스+normalizeTrackingNumber → `@sirubot/utils` 서브패스 승격 |
| 12 | sentAt 계약 드리프트 | `apps/bot/src/services/memberGreetingService.ts:261` (ISO 문자열) vs `apps/data-api/src/services/hubs/memberGreetingHub.ts:51` (number만) | zod 스키마로 통일 필요 |

## 3. P2: 슬롭 정리 웨이브 (반복·죽은 코드)

### apps/bot (29건 — `/tmp/opencode/audit/deslop-bot.md`)
- 필터 프리셋 switch 3중복: `modules/audio/commands/filter.ts:39-60`, `filterSelectMenu.ts:83-104`, `services/aiTools/music.ts:194-218` (resetFilters 재삽입도 3곳)
- AI 채팅 턴 오케스트레이션 ~45줄 복제: `modules/general/commands/chat.ts:124-184` ↔ `mentionReply.ts:106-161` (오류 분기 불일치 — 재던짐 vs 삼킴)
- 오하아사 카드 파이프라인 봇측 사망 잔재: `services/dataApiClient.ts:222-241` 호출 0, `ohaasaCardPayload.ts` 유일 소비=자기 테스트, `ohaasa.ts:131,144` files 항상 undefined
- 곡 위치 파서 2중복: `seek.ts:31-52` ↔ `aiTools/music.ts:180-192` (isNaN vs Number.isNaN)
- trackHandler 퍼사드 테스트 전용 public 위임 3개: `trackHandler.ts:122-125,141-144,156-164`
- 서비스 레이어 UI 뷰 직접 조립: `playerWebResponder.ts:40`, `audioService.ts:19-20` / services→모듈 내부 타입 역참조: `dataApiClient.ts:3-5`
- THINK 라이브 화면 미정제 추론 노출: `services/aiChat/completion.ts:161-163` vs finalizeText `:33-36` (중지 시 정제본 미출력)
- eval 결과 ephemeral 없이 채널 게시: `evalModal.ts:26` deferReply 무플래그
- web_fetch SSRF 가드 236줄 무테스트, `aiTools/music.ts` 573줄에 테스트 2케이스
- 동작 잔재 4건: `customCommands/store.ts:53` 동시로드 실패 시 원본 예외 유출 / 채널 턴 점유 실패 시 10분 토큰 미환불 / `pendingWriteStore.ts:125-127` void then 미catch → isRedisConnected 영구 false 가능 / `clientReady.ts:73` 종료 불가 setInterval

### apps/dashboard (28건 — `/tmp/opencode/audit/deslop-dashboard.md`)
- **[high] 한글 본문 11px**: `globals.css:154` `--text-2xs:0.6875rem`로 본문 문장 렌더 8곳 (layer-panel:38, layer-properties:37, greeting-background-section:105-107, greeting-test-panel:65-69, greeting-template-field:98-103, custom-command-editor:44-46·401-403, mixer-info:178) — 본문은 text-sm 유지
- **세션 게이트 우회 raw useSWR 5곳**: `use-bot-profile.ts:18`, `use-guild-assets.ts:57`, `player-live-tab.tsx:81`, `player-client.tsx:117`, `web-player-section.tsx:135` (+`server-switcher.tsx:33`) — `lib/swr.ts`의 useAuthedSWR/useGuildResource 계약과 상반. 세션 만료 401이 일반 에러로 처리됨
- 설정 저장 try/catch+토스트 25블록/13파일 (reportError 로컬 헬퍼 3곳 + 문구 "봇이 곧 새 설정을 적용해요." 5곳) → notifyApiError/notifySaved 통합
- 사이드바 활성 인디케이터 25줄 완전 복제: `playlist-sidebar.tsx:27,35-61` ↔ `server-feature-sidebar.tsx:19-66` → useSidebarIndicator
- 플레이리스트 모달 사본 2쌍 (create↔edit 1-73 동일, delete-playlist↔delete-track) → PlaylistFormModal+ConfirmDeleteModal
- 2단계 삭제 확인 4구현 (assets-settings:50-58,116-132 ≡ custom-commands-settings:45-53,117-133 — 4초 타이머 동일) → useConfirmDelete
- /design 전용 컴포넌트 ~780줄 제품 미사용 (discord/permission-list·embed-preview·channel-message, data/data-table·tag-input, ui/table)
- 미사용 export 6종: `lib/redis.ts:117` redisDel, `lib/storage.ts:27` isStorageConfigured(주석 거짓), `customCommandSpecSchema`, `LiveQueueTrack`, `CardAction`, `slashSlotWarning`(자기 테스트만 소비)
- 테스트 공백: 무테스트 순수 로직 `lib/api-error.ts:7-25`(retryable, 13컴포넌트 의존)·youtube-url·format·hangul·zodiac 등, `app/api/**` 테스트 0건(46라우트)

### 인프라 5앱 (18건 — `/tmp/opencode/audit/deslop-infra.md`)
- Twitch EventSub 구독 삭제 죽은 코드: `twitchApi.ts:151` deleteSubscription=테스트 전용, `routes/social.ts:187-206` DELETE가 Twitch 미연동·구독 누적
- 허브 payload 검증 2갈래: 공용 zod vs `botProfileHub.ts:52-93`·`memberGreetingHub.ts:37-57` 40줄 수동검증+봇과 중복 인터페이스
- db.ts 바이트 동일 복제 (data-api↔notifier `services/db.ts` 1-36행) / Redis+메모리 폴백 래퍼 2벌 (`utils/cache.ts` vs `services/redis.ts`) / Pub/Sub 구독자 수명주기 2벌 (HubSubscriber 1s→5s vs ManagedRedisSubscriber 5s→60s) / 허브 evict 블록 3벌
- 이미지 dedup 키에 payload 누락: `render.ts:73`(프로필 preset)·`:136`(인사 config) → 동시 요청 시 첫 렌더 공유. 키에 payload 해시 추가
- canvasUtils 죽은 코드 ~220줄: Path2D 폴백 파서 140줄 도달 불가 + 미사용 아이콘 21종
- 테스트 결손: hubSubscriber, botProfileHub, memberGreetingHub, memoryTidy, ohaasaScheduler, notifier routes/schedulers, shardmanager ws IDENTIFY(SEC-003), shardclient client.ts 전부 무테스트
- data-api console.* 로깅 유출 6곳, SSE `player.ts:80` try 밖 파싱 → 400 아닌 500

### packages (30건+ — `/tmp/opencode/audit/deslop-packages.md`)
- 모듈 로드 시 git execSync 4회: `version.ts:47-51,85` (`index.ts:4`+`embed.ts:12` 진입) → lazy getter
- 완전 죽은 export: `embed.ts:15,29` ExtendedEmbedBuilder·buildErrorEmbed (0건) / configureAppEmojiFetcher 0건 호출로 `appEmoji.ts:197-207` apiFetcher 분기 도달 불가
- app-kit logger가 utils logger 수동 미러: `app-kit/src/logger.ts:4-20` ↔ `utils/src/logger.ts:3-19`, 원본 createLogger 사용 0건
- 미사용 export 13종 배럴 오염 + 내부 심볼 ~40종 `export *` 유출 → 명시적 named re-export 전환
- `@redis/client` 메이저 2종 공존 (utils ^5.8.2 vs dashboard ^6.3.0) → RedisClientType 불일치 / undici peer-dep 2중 선언
- app-kit 테스트 0개 (`--passWithNoTests`; timingSafeKeyEqual·createKeyPreHandler·env·logger 미검증), app-kit이 `process.exit(1)` (`auth.ts:36`, `env.ts:9-11`) → throw+진입점 exit로 위임
- prisma 미사용 인덱스 `SocialEventLog_deliveredAt_idx` (`schema.prisma:307,310`), packages/prisma에 lint·typecheck 스크립트 없어 CI 제외

### 크로스 워크스페이스 중복 (17건 — `/tmp/opencode/audit/dup-cross.md`)
- logger 3사본: `utils/src/logger.ts` ↔ `app-kit/src/logger.ts:4-25` ↔ `apps/bot/src/core/logger.ts:9-20` (LOG_LEVEL_MAP+resolveMinLevel까지)
- Redis 래퍼 골격 ~80% 중복 3번째 변형: `data-api utils/cache.ts` ↔ `notifier services/redis.ts` ↔ `dashboard lib/redis.ts`
- 카드 렌더 payload 계약 이중 정의 4쌍 (봇 `dataApiClient.ts` Profile/NowPlaying/Ohaasa/MemberCard ↔ data-api `render.ts`·`ohaasaCardSchema.ts`) — `playerState.ts` 선례대로 utils 단일 홈 가능
- CHAT_TOOL_MODES 상수·정규화기 이중 (`bot guildService.ts:50-55` ↔ `dashboard lib/schemas.ts:8,131-135`)
- 대시보드 소셜 타입 재선언 (`types/social.ts:2-4,32-41` ↔ `utils social.ts` + `notifier chzzkApi.ts:105-113`)
- low: 스노플레이크 zod 3벌, dataURI 정규식+1.5M 상한 복제, zod 첫 이슈 포맷팅 3구현, sampleGreetingText=renderGreetingTemplate 사본, `#ffdaff` 하드코딩, 스토리지 키 정규식+MIME 맵 복제, OpenAI env 기본값 이중
- **제외**: ZODIAC_MAP/HoroscopeData/DailyHoroscope 중복(`ohaasaService.ts:2-50` ↔ `providers/types.ts:4-31`)은 refactor-plan §2.1b "유지" 판정 — 판정 갱신 검토 권장

## 4. P3: 타이포·문서 (31건 — `/tmp/opencode/audit/typos.md`)

- **[med]** `eventsub.ts:75` `건너뜌` 단어 파손 / `messageDeleted.ts:46` `메세지`→`메시지` (저장소 421:1 불일치) / `웨훅` 28건·9파일 vs `웹훅` 106건 표기 이원화 (`social.ts:173` 한 줄 혼용) / 슬래시 description 해요체 vs ko 로컬라이제이션 합니다체 4곳 (recommend/search/skip/autoplay) / `playlistService.ts:35` 문장 내 혼조 / 깨진 문서 링크 5건+앵커 2건
- [low] 봇 잔존 합니다체 4곳, 대시보드 API `잘못된 요청입니다.` 10건, `해주세요` 13 vs `해 주세요` 254, `음성채널` 14 vs `음성 채널` 87, `.env.example` `seperated`·`on this guilds`, README 구조 블록 storage/notifier/app-kit 누락, dash 제목(#) 내 `—` 27건·7파일 (PR 규칙 정합성 확인 필요)
- 깨짐·`됬/되요` 계열은 미발견

## 5. 구조 랭킹 TOP (18건 — `/tmp/opencode/audit/structure.md`)

1. env 파싱 2체제: Fastify 4앱은 zod fail-closed(`parseEnvOrExit`), bot·dashboard만 process.env 48곳 산발 (`global.d.ts:17-36` 선언16/미선언20, `dataApiClient.ts` 5곳 + `embedFixGateway:23` + `playbackReporter:22` 폴백체인 7중복, `bootstrap.ts` 4곳, `dashboard lib/data-api.ts:48-50`)
2. HTTP 에러 응답 계약 5종 + Fastify 4앱 중 3개 setErrorHandler 부재 (`data-api routes/common.ts:11-29` / `notifier eventsub.ts:35` / `shardmanager server.ts:34-42` / `app-kit auth.ts:44` 영문·`:68` 한글)
3. dashboard 실패 표현 3종 혼재 (null vs throw vs ApiError — `lib/data-api.ts:54-124`, `shard-api.ts:34` vs `:45,:56`, `storage.ts:43,63`)
4. 로거 4구현 + storage 로거 부재 (`index.ts:18` console) + 전역 핸들러 3구현/미도입 2앱
5. 인증 fail-closed 3구현 (`app-kit auth.ts:29-44`의 `process.exit` / `notifier env.ts:39-42`·`storage env.ts:21-24` 2차 exit)
6. **문서 오기**: `yarn dev`는 대시보드만 실행(`dashboard package.json:6`에만 존재)인데 README.md:155,170,178·README.ko.md:155,166,174·setup-dev.md:17·AGENTS.md:53이 "전체 실행"이라고 서술
7. canvasUtils 582줄 혼재 (아이콘 경로 DB:118-350 + 폰트 side effect + 이미지 allowlist 보안:62-79 + 도형)
8~11. 대형 파일 잔존: audioService 561줄(재생+스킵 정책), guildService 517줄(애네믹 CRUD 44개), `dashboard lib/data-api.ts` 506줄(4책임), nodeHandler 545줄(이벤트+세션 복원 엔진)
12. .env.example 불일치 (dashboard STORAGE_URL/STORAGE_AUTH_KEY·DASHBOARD_ADMIN_IDS·REDIS_URL 누락, notifier .env.example 부재, shardmanager PORT=3000, data-api TRANSLATION_PROVIDER 유령)
13. 테스트 설정 2벌 (vitest.config.ts `.ts`만 vs dashboard `ts,tsx`, app-kit 별칭 유무, app-kit·prisma 테스트 0)
14. bot 부팅 체인 이름-역할 불일치 (`environment.ts` 사실상 크래시 핸들러:9-27, `setup.ts:1` import side effect, `bootstrap.ts:13-272` 단일 main)
15. "get*"이 실패를 null/false로 삼킴 (`dashboard redis.ts:78-86,:89-102`, `data-api.ts:54`, `aiChat/config.ts:6-9,:31-41`, `canvasUtils:7,45,361`)
16~18. 에러 레벨·이름 혼재, `.prettierrc.mjs` 8벌 + dashboard prettier 제외(`api-guards.ts` 2스페이스/큰따옴표), 잔존 대형 파일(`aiTools/music.ts` 573줄 도구 19종, `playerWebResponder.ts:75-495`)

## 6. 버그 상세 (14건 — `/tmp/opencode/audit/bugs.md`)

P0 외 잔여:
- **[med]** ManagedRedisSubscriber 소켓 리크 2종: `redisSubscriber.ts:56-88,102-115` (① stop()이 connect 완료 전이면 이후 완성된 구독 연결 영구 잔류 ② connect 성공+subscribe 실패 시 client 미destroy)
- **[med]** `redisStore.ts:306-310` disconnect()가 미 ready에서 quit/destroy 생략 → Redis 장애 중 종료 시 재연결 루프 생존 → 우아 종료 지연→SIGKILL
- **[med]** notifier 폴러 DB 오류 삼킴: `chzzkPoller.ts:91-93`, `twitchScheduler.ts:51-53`, `youtubeScheduler.ts:65-67`의 `.catch(() => [])` → DB 장애 시 라이브 감지·WebSub lease 갱신 침묵 중단
- **[med]** `pendingRequestPool.ts:55-58,71-75` onTimeout 선타 호출 → `webhookHub.ts:45-50` 타임아웃 응답의 guildId가 항상 `''`
- **[low]** `pendingWriteStore.ts:121-128` drain `.catch` 누락, `playerSaver.ts:29`·`queueStore.ts:42-45` 저장값 JSON.parse 무검증, `rate-limit.ts:45` Lua math.random 시드(Redis <7), `shardclient/client.ts:209-222` 인터벌 미정리 리크, `memoryTidy.ts:232-241` nextRunAt 불일치, `guild-data.ts:180-187` 동시 인사 테스트 첫 요청 타임아웃

## 7. 교차 테마

1. **env 파싱 2체제** — bot·dashboard의 산발 process.env를 `parseEnvOrExit` 계열로 수렴하면 structure #1·#12·packages low가 동시 해소
2. **에러/로거 혼재** — HTTP 에러 계약 5종·로거 4구현·get*의 null 삼킴 → setErrorHandler + 로거 단일화 + 실패 표현 계약
3. **테스트 공백이 보안 경로에 집중** — 인가 게이트·HMAC 허브·ws IDENTIFY·app-kit이 전부 무테스트
4. **PR #125 패턴 미확산** — "공용 모듈+호출자 위임" 패턴을 이웃 원본 사본(db.ts·Redis 래퍼·구독자·evict·로거)에 그대로 적용하면 P2 대다수가 해결됨

## 8. 수정 로드맵 (제안)

| 웨이브 | 범위 | 산출 |
|---|---|---|
| W-A | P0 6건 (보안·장애) | 버그 수정 PR 1~2개 — IDOR, watchdog, 복구 지연, notifier 로거, HMAC, 게이트 테스트 |
| W-B | P1 6건 (계약) | 패키지 승격 PR — 서브패스 분리, 인사 카드 단일화, 설정 계약 단일화, 날씨/택배 승격 |
| W-C | P2 슬롭 | 워크스페이스별 PR (bot / dashboard / infra / packages) |
| W-D | P3 타이포·문서 | 일괄 표기 통일 + README `yarn dev` 오기 수정 |
| W-E | 테스트·구조 | env 수렴, setErrorHandler, 로거 단일화, 대형 파일 분할 |

---

*원본 감사 리포트 8개: `/tmp/opencode/audit/{deslop-bot,deslop-dashboard,deslop-infra,deslop-packages,dup-cross,bugs,typos,structure}.md` (2026-10-21 생성, /tmp 휘발 주의)*
