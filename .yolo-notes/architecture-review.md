# SiruBOT 아키텍처 리뷰

브랜치: `feat/yolo-improvements` (beta 기반) · 분석일: 2026-10-05
분석 범위: 읽기 전용. 코드 수정 없음.

---

## 1. 전체 아키텍처

### 모노레포 구성 (yarn workspaces + turbo)

| 워크스페이스 | 역할 | 진입점 | 핵심 기술 |
|---|---|---|---|
| `apps/bot` | Discord 봇 본체 (Sapphire 프레임워크) | `src/index.ts → core/setup.ts → core/bootstrap.ts → core/botApplication.ts` | Sapphire, lavalink-client, Prisma, Redis, @sentry/node |
| `apps/data-api` | 외부 데이터 게이트웨이 + 이미지 렌더 | `src/index.ts → server.ts → routes/index.ts` | Fastify, skia-canvas, zod, Redis |
| `apps/shardmanager` | 샤드 조정자 (봇 프로세스 관리) | `src/index.ts → server.ts → routes/` (autoload) | Fastify, @fastify/websocket |
| `apps/dashboard` | 웹 관제/설정 UI | Next.js App Router | Next.js 16, NextAuth(Discord OAuth), SWR |
| `packages/prisma` | 공유 DB 스키마 | `src/schema.prisma` | Prisma (Guild/Track/User/GuildTrackHistory/Playlist/PlaylistTrack/ChannelChatHistory/UserMemory) |
| `packages/shardclient` | 봇→매니저 WS 클라이언트 라이브러리 | `src/client.ts`, `src/core/ws.ts` | ws, zod |
| `packages/utils` | 공용 유틸 (logger, memoryCache, format 등) | `src/` | tslog |

### 통신 흐름

```
Discord ──▶ apps/bot ◀──WS──▶ apps/shardmanager (HELLO→IDENTIFY→HEARTBEAT/STATUS/STATS/BROADCASTEVAL, zod 검증)
              │  ▲                    ▲
              │  │                    │ WS (packages/shardclient)
              ▼  │                    │
       apps/data-api (HTTP, AUTH_KEY 헤더) ── upstream 프록시/캐시 (운세·가사·날씨·유튜브 챕터·택배)
              │                        └─ skia-canvas 프로필 카드 렌더 (/v1/image/profile)
              │                        └─ 재생 이벤트 수집, 번역·기억정리 LLM 배치
              ▼
       packages/prisma (PostgreSQL) ◀── bot · dashboard · data-api 공유
              ▲
       apps/dashboard ── Route Handler → auth() → Prisma 직접 조회 or shardmanager/data-api 프록시
```

### bot 내부 구조 (modules/)

- `modules/audio/`: 음악 핵심. `commands/` 25개(입력 파싱) → `view/` 15개(순수 렌더 함수, ContainerBuilder 반환) → `interaction-handlers/`(버튼/셀렉트 후속 처리) 3층 구조
- `modules/audio/lavalink/`: `handlers/` 4개(Node/Player/Track/SponsorBlock, `base.ts`의 `wrapAsyncHandler`로 예외 흡수) + `player/`(CustomPlayer, playerNotifier, playerSaver) + `queue/queueStore.ts`
- 상태 저장: `redisStore.ts` 3중 구조 — NodeSessionStore(TTL 5분), CachedPlayerSaver(TTL 7일+메모리 30분), CachedQueueStore. Redis 단절 시 메모리+pendingWrites 폴백
- 재시작 복구: `nodeHandler.ts` — resumed=true면 서버 resume, false면 Redis 기반 fresh 복원
- `modules/games/`, `modules/voice/`, `modules/general/`: 게임·음성·일반 명령어
- `preconditions/` 10개: DJOrAlone, SameVoiceChannel, SongPlaying, TextChannelAllowed 등 파일명 기반 자동 로드

---

## 2. 우선순위 높은 개선점 (Top 8)

### ① 내부 상태 API 무인증 노출 [보안 · 최우선]
- **무엇을**: dashboard의 `/api/shards`, `/api/data-api` 라우트에 `auth()` 인증 추가. data-api의 `plugins/auth.ts`에서 `/dashboard` 인증 제외 제거 또는 data-api 포트 바인딩을 `127.0.0.1:3002:3002`로 제한.
- **왜**: 샤드 분포·메모리·플레이어 수, data-api 캐시 적중률·에러율 같은 내부 인프라 상태가 비로그인 사용자에게 그대로 공개됨. data-api는 `docker/docker-stack.yml`에서 `3002:3002`로 외부 공개 + `/dashboard`가 인증 제외라 관제 페이지가 인터넷에 열려 있음.
- **어디서**: `apps/dashboard/src/app/api/shards/route.ts`, `apps/dashboard/src/app/api/data-api/route.ts`, `apps/data-api/src/plugins/auth.ts:5`, `docker/docker-stack.yml:96-98`

### ② shardclient 수신 메시지 스키마 미검증 [안정성/보안]
- **무엇을**: `packages/shardclient/src/core/ws.ts`의 수신 경로에 `WsMessageSchema.parse` 검증 추가.
- **왜**: manager(`apps/shardmanager/src/routes/ws/index.ts`)는 검증하는데 client는 `JSON.parse`만 함. 깨진/악의적 payload가 `evalCallback`(임의 스크립트 실행 콜백)까지 그대로 전달될 수 있음.
- **어디서**: `packages/shardclient/src/core/ws.ts:48-55`

### ③ 큐 Redis 키 영구 잔류 (TTL 누수) [운영]
- **무엇을**: `CachedQueueStore.set()`에 EX(예: 7일, player 키와 동일) 부여 + `PlayerHandler.handlePlayerDestroy`에서 `getQueueStore().delete(guildId)` 호출.
- **왜**: 큐 키는 TTL이 없고 in-repo 삭제 경로가 stale 정리뿐이라 정상 `/stop` 때마다 `lavalink/queue/{guildId}`가 Redis에 영구 잔류 → 장기 키 누수. 추가로 `queueStore.syncPendingWrites()`는 `allSettled` 후 무조건 `pendingWrites.clear()` — playerSaver는 실패 키 보존 패치가 이미 됐는데 queueStore는 미적용이라 재연결 시 데이터 손실.
- **어디서**: `apps/bot/src/modules/audio/lavalink/queue/queueStore.ts:69` (set), `:131-151` (syncPendingWrites), `apps/bot/src/modules/audio/lavalink/handlers/playerHandler.ts:60-65`

### ④ playerUpdate 쓰기/편집 폭증 스로틀 [성능/비용]
- **무엇을**: `handlePlayerUpdate`의 Redis SET와 컨트롤러 메시지 edit를 변경분 비교(또는 15~30초 스로틀)로 제한.
- **왜**: Lavalink의 주기적 playerUpdate마다 활성 길드 수에 비례해 플레이어 전체 JSON Redis 쓰기 + Discord 메시지 edit 발생. progress timestamp 한 줄을 위한 edit이라 rate limit/비용의 직접 원인. (`playerNotifier.ts`는 300ms 디바운스만 있음)
- **어디서**: `apps/bot/src/modules/audio/lavalink/handlers/playerHandler.ts:76-78`, `apps/bot/src/modules/audio/lavalink/player/playerNotifier.ts:103-140`

### ⑤ lavalink 핸들러 에러가 Sentry에 안 잡힘 + data-api/shardmanager 추적 부재 [관측성]
- **무엇을**: `wrapAsyncHandler`의 catch에서 `guildId`·`nodeId` 태그와 함께 `Sentry.captureException` 추가. `initSentry()`를 `packages/utils`로 공용화해 data-api/shardmanager 엔트리에도 초기화 + `unhandledRejection`/`uncaughtException` 핸들러 추가 (data-api는 핸들러 자체가 없음).
- **왜**: audio 모듈에서 Sentry를 직접 import한 파일이 0개. resume 실패·복원 실패·노드 장애가 로그 속에만 묻힘. shardmanager(모든 샤드 프로세스 관리)와 data-api(캐시/LLM 게이트웨이)가 크래시 나면 추적 수단 전무.
- **어디서**: `apps/bot/src/modules/audio/lavalink/handlers/base.ts:11-22`, `apps/bot/src/core/sentry.ts` (→ `packages/utils/src/sentry.ts` 신설), `apps/data-api/src/index.ts`, `apps/shardmanager/src/index.ts`

### ⑥ ShardRegistry.broadcast() 백프레셔 없음 [안정성]
- **무엇을**: `bufferedAmount` 임계치 초과 시 해당 소켓 스킵/종료, WS `maxPayload` 설정. `reconnect()`의 destroy 후 재시도 race 수정.
- **왜**: 모든 소켓에 동기 send 루프 — 느린 클라이언트 하나가 브로드캐스트를 막거나 메모리를 키움. `BROADCASTEVAL_RESULT` 전파 구조라 장애 전파 경로가 됨. client는 `HEARTBEAT_ACK`를 무시해 manager가 죽어도 TCP half-open이면 무한 대기 가능.
- **어디서**: `apps/shardmanager/src/core/shardRegistry.ts:196-206` (broadcast), `:63-65` (forceAllocate 중복 체크 없음), `packages/shardclient/src/client.ts:119-146` (reconnect race), `:221-230` (heartbeat)

### ⑦ TextChannelAllowed의 명령어당 DB+REST 상수 비용 [성능]
- **무엇을**: `guildService` 캐시(60s TTL) 재사용 + `channels.fetch` 전 `channels.cache` 확인 및 채널 존재 여부 단기 캐싱.
- **왜**: 22개 명령어에 장착된 precondition이 실행마다 Prisma `findUnique` + Discord REST(`channels.fetch`)를 발생 — 응답 지연과 rate limit의 상수 비용.
- **어디서**: `apps/bot/src/modules/audio/preconditions/TextChannelAllowed.ts:26-67`

### ⑧ 테스트 인프라 부재 [품질 기반]
- **무엇을**: 루트 vitest 설정 + 각 워크스페이스 `"test": "vitest run"` 스크립트 추가. 1차 타깃: `packages/utils` 순수 함수, `serveCached`/`breaker`/`dedup`(data-api), ws zod 스키마, `ShardRegistry` allocate/release, `autoPlayRelated.ts`의 `pickBySimilarity`/`titleSimilarity`.
- **왜**: `*.test.ts` 0개, `vitest.config` 0개, `test` 스크립트 0개 — 루트 devDeps의 vitest는 사장. `yarn test`는 turbo 에러로 실패. 상태 기계가 복잡한 영역(trackHandler 609줄, nodeHandler 497줄)이 무방비.
- **어디서**: 루트 `vitest.config.ts` 신설, 각 `package.json` + `turbo.json` test 태스크

---

## 3. 차순위 개선점 (요약)

| # | 무엇을 | 왜 | 어디서 |
|---|---|---|---|
| A | data-api `/v1/image/profile` rate limiting 추가 | CPU 집약 렌더에 dedup만 있고 빈도 제한 없음. AUTH_KEY 하나로 무한 호출 가능 | `apps/data-api/src/routes/index.ts` |
| B | data-api 에러 응답 `detail` 제거/마스킹 | 500 응답에 `error.message` 그대로 노출 → 내부 정보 유출 | `apps/data-api/src/routes/index.ts:33-46` |
| C | data-api 프로덕션에 `prisma migrate deploy` 추가 | data-api도 Prisma 사용(memoryTidy)하는데 bot만 migrate 실행 → 스키마 변경 시 런타임 에러 | `Dockerfile` data-api 스테이지 CMD |
| D | interaction-handler 가드 3중복 헬퍼화 | 음성채널+DJ+플레이어 체크가 4개 핸들러에 복사됨 (`resolvePlayerOrReply` 헬퍼) | `controllerButton.ts`, `controllerSelectMenu.ts`, `filterButton.ts`, `filterSelectMenu.ts` |
| E | `handleTrackStuck` ↔ `handleTrackError` 통합 | 86줄 중 70줄 동일 (abort 분기·예열 소비·스킵 폴백) | `apps/bot/src/modules/audio/lavalink/handlers/trackHandler.ts:142-228` |
| F | DJ 권한 의미 통일 + precondition 누락 정리 | `/믹서`의 인라인 checkDJ는 alone 예외 없음 vs 나머지는 허용. `tts` DJ 게이트 없음, `lyrics`에 불필요한 NodeAvailable, `previous`에 TextChannelAllowed 누락 | `commands/mixer.ts:89-97`, `commands/tts.ts`, `commands/lyrics.ts`, `commands/previous.ts` |
| G | env 파싱 zod 통일 + `.env.example` 보완 | 3가지 방식 병존(bot @skyra/env-utilities + global.d.ts 중복, data-api/shardmanager zod 복붙, dashboard 직접 읽기). data-api/dashboard `.env.example` 없음 | `packages/utils/src/env.ts`, `apps/bot/src/types/global.d.ts` |
| H | 로거 중복 제거 | bot의 `LOG_LEVEL_MAP` 복사본, audio 6개 파일의 직접 tslog import → utils 경유 일원화 | `apps/bot/src/core/logger.ts`, lavalink 6개 파일 |
| I | 프로필 카드 폰트 로드를 부팅 시 1회로 | 요청 경로에 리소스 로딩 — 최근 커밋 3개가 전부 폰트 경로 fix (구조적 원인) | `apps/data-api/src/renderers/profileCard.ts:299-307` |
| J | 아바타 URL SSRF allowlist | zod `url()` 검증만으로 임의 URL fetch | `apps/data-api/src/renderers/profileCard.ts:228-239` |
| K | `GuildTrackHistory`에 `(trackId, createdAt)` 인덱스 | trackId 기준 집계 시 풀스캔 | `packages/prisma/src/schema.prisma:62-72` |
| L | dashboard `SHARD_MANAGER_AUTH_KEY` 기본값 제거 | `|| 'youshallnotpass'` 하드코딩 — env 누락 시 기본 키로 내부망 호출 | `apps/dashboard/src/lib/shard-api.ts` |
| M | Docker 프로덕션 이미지 devDependencies 포함 | "production node_modules" 주석과 달리 전체 복사 → 이미지 비대. HEALTHCHECK 없음 | `Dockerfile` 각 스테이지 |

## 4. 정량 스냅샷

- TS 파일 270개, 테스트 파일 0개
- `as any` 등: 15개 파일 (bot 18건이 최다, `aiChatService.ts` 4건)
- non-null assertion(`!.`): bot 10개 파일 + data-api 4개 파일
- `console.log/error/warn`: 34건 (로거 미사용)
- 빈 catch 블록 2건 (`sponsorBlockHandler.ts:53`, `messageDeleted.ts:54`)
- bot `try` 블록 125개 (에러 처리는 양적으로는 충분, 질적으로 구멍 존재)

## 5. 영역별 상세 보고서 원문

세 영역 병렬 분석 결과는 이하 요약에 통합됨:
- bot 앱: 명령어/view/핸들러 3층 구조, Lavalink 상태 저장·복구, precondition 체계 분석
- 백엔드: data-api/shardmanager/shardclient/prisma/dashboard, Docker, 중복 코드 분석
- 크로스커팅: 로깅·env·TS strict·테스트·Sentry·의존성·문서 괴리 분석
