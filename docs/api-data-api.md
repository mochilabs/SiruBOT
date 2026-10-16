# data-api HTTP 계약

> **기준일**: 2026-10-15

공유 채널·플로우 상위는 `./architecture.md` (`5.2 Redis Pub/Sub 채널 맵`, `6.2 Redis request/reply`, `6.3 외부 제공자 캐싱`) 참조. 본 문서는 HTTP 라우트 실측 기준이다.

## 인증 규약

- 키: `DATA_API_AUTH_KEY ?? AUTH_KEY` 폴백. 둘 다 없으면 **기동 거부(fail-closed)** — `process.exit(1)` (`apps/data-api/src/plugins/auth.ts:17-22`).
- 인증 면제는 `/api/health`뿐 (`apps/data-api/src/plugins/auth.ts:8`). 비교는 sha256 `timingSafeEqual` (`auth.ts:11-15`).
- 호출 측은 `Authorization` 헤더에 **Bearer 없이 키 원문** (`apps/dashboard/src/lib/data-api.ts:38-57`). data-api·봇·대시보드 3개 앱이 같은 키 공유.
- 키 미설정 시 대시보드는 호출 전면 스킵 → 채널/역할/플레이어 연동이 502처럼 보인다.

## 엔드포인트 (전수: `apps/data-api/src/routes/index.ts`)

| 메서드·경로 | 설명 | TTL / 비고 | 코드 |
|---|---|---|---|
| GET `/api/health` | 헬스 (인증 면제 유일) | — | `routes/index.ts:107` |
| GET `/dashboard` | 내장 모니터링 HTML (인증 필요) | 5초 폴링 | `routes/dashboard.ts:9-14` |
| GET `/v1/status` | 운영 지표 (캐시·서킷·허브 상태) | — | `routes/index.ts:116` |
| GET `/v1/youtube/search?query=` | Lavalink REST YouTube 검색 | — (미캐시) | `routes/index.ts:134` |
| GET `/v1/ohaasa` | 오늘의 운세 (번역본 캐시) | 7일 | `routes/index.ts:153-185` |
| POST `/v1/ohaasa/refresh` | 운세 즉시 갱신 | — | `routes/index.ts:187` |
| GET `/v1/lyrics?q=` | 가사 검색 (lrclib) | 30일 (`LYRICS_TTL_SECONDS`) | `routes/index.ts:198-213` |
| GET `/v1/weather?location=&scope=` | 지오코딩+예보+대기질 | 15분 (`WEATHER_TTL_SECONDS`) | `routes/index.ts:220-241` |
| POST `/v1/playback/events` | 봇 재생 이벤트 수집 | — | `routes/index.ts:255` |
| GET `/v1/playback/recent?limit=` | 최근 재생 이벤트 조회 | — | `routes/index.ts:265` |
| GET `/v1/player/:guildId` | 라이브 플레이어 상태 (player:null 폴백) | — | `routes/index.ts:276` |
| GET `/v1/bot-profile/:guildId` | 봇 프로필 조회+새로고침 | — | `routes/index.ts:289` |
| GET `/v1/player/:guildId/stream` | SSE 스트림 (`reply.hijack`) | 킵얼라이브 15초 | `routes/index.ts:304-338` |
| GET `/v1/delivery/track?carrier=&number=` | 택배 조회 | 5분 | `routes/index.ts:345-364` |
| POST `/v1/image/profile` | 프로필 카드 PNG (dark/ticket) | dedup 키 `img:card:` | `routes/index.ts:411` |
| POST `/v1/image/member-card` | 멤버 인사 카드 | dedup 키 `img:greeting:` | `routes/index.ts:475` |
| POST `/v1/image/member-card/background` | 배경 JPEG 정규화 (1600px·900KB) | body 8MB | `routes/index.ts:525` |
| POST `/v1/image/member-card/layer-image` | 스티커 PNG 정규화 | body 8MB | `routes/index.ts:526` |
| POST `/v1/image/nowplaying` | NowPlaying 카드 (5초 버킷) | dedup 키 `img:nowplaying:` | `routes/index.ts:597` |
| POST `/v1/image/ohaasa` | 운세 카드 | dedup 키 `img:ohaasa:` | `routes/index.ts:613` |
| POST `/v1/internal/guild-settings/invalidate` | 길드 설정 캐시 무효화 브로드캐스트 | Redis 없으면 503 | `routes/index.ts:633` |
| POST `/v1/ai/custom-command-draft` | 커스텀 명령어 AI 초안 (자연어 → v2 스펙 초안) | 미설정 503·실패 502 | `routes/index.ts:653` |
| POST `/v1/ai/custom-command-refine` | 커스텀 명령어 AI 반복 수정 (현재 스펙+지시+최근 대화 → 수정 스펙) | 미설정 503·실패 502 | `routes/index.ts` |
| POST `/v1/internal/player/search` | 웹 플레이어 검색 (request/reply) | — | `routes/index.ts:711` |
| POST `/v1/internal/player/play` | 웹 플레이어 재생 | — | `routes/index.ts:728` |
| POST `/v1/internal/player/control` | 웹 플레이어 제어 | — | `routes/index.ts:745` |
| GET `/v1/player/:guildId/voice-context?userId=` | 요청자 음성·권한 상태 | — | `routes/index.ts:764` |
| POST `/v1/internal/jtc/setup` | JTC 마커 채널 셋업 | — | `routes/index.ts:804` |
| POST `/v1/internal/bot-profile/set` | 봇 프로필 적용 (pending+브로드캐스트) | TTL 120초·body 8MB | `routes/index.ts:833-835` |
| POST `/v1/internal/greeting/send` | 인사 테스트 전송 | TTL 120초 | `routes/index.ts:874-876` |
| GET `/v1/greeting/state/:guildId` | 인사 테스트 결과 폴링 | — | `routes/index.ts:897` |
| GET `/v1/guilds/:guildId/channels` | 봇 캐시 채널 목록 | — | `routes/index.ts:912` |
| GET `/v1/guilds/:guildId/roles` | 봇 캐시 역할 목록 | — | `routes/index.ts:924` |
| GET `/v1/chapters?videoId=&durationMs=` | 유튜브 챕터 | 12시간 | `routes/index.ts:945-960` |

## 에러 매핑

릴레이 3종(길드 데이터·플레이어 웹·JTC)이 같은 규칙 (`routes/index.ts:75-98`):

| 사유 | HTTP | 코드 |
|---|---|---|
| `redis_unavailable` | 503 | `redis_unavailable` |
| `timeout` (봇 미응답·미보유 포함) | 502 | `bot_timeout` |
| `bot_error` (봇 검증 거부) | 400 | 거부 코드 그대로 전달 |

길드 데이터 흐름에는 `bot_error` 분기가 없다 (`routes/index.ts:100-104`).

## 스케줄러 2종

- **운세**: 매일 KST 06:50 (`OHAASA_REFRESH_AT` 기본값 `apps/data-api/src/config/env.ts:16`, 스케줄러 `services/ohaasaScheduler.ts:93,114`). upstream 전멸 시 마지막 성공 본 폴백 (`routes/index.ts:172-180`).
- **memory tidy**: `DATABASE_URL`+프로바이더+`MEMORY_TIDY_ENABLED` 모두 있어야 실행, 기본 매일 00:00·배치 40 (`services/memoryTidy.ts:195-201`, `config/env.ts:19-21`).

## 기존 문서와의 불일치 (코드 기준)

- `README.ko.md:114-126` 표는 12개만 수록 — `/v1/youtube/search`·`/v1/player/*`·`/v1/bot-profile/*`·`/v1/image/*` 5종·`/v1/internal/*` 7종·`/v1/guilds/*`·`/v1/greeting/state/*`·`/v1/chapters` 누락. TTL 표기(운세 7일·가사 30일·날씨 15분·챕터 12시간·택배 5분)는 코드와 일치.
- `routes/index.ts:113` 주석 "auth 제외 대상에 추가"는 stale — 실제 면제는 `/api/health`뿐이고 `/dashboard`도 인증 필요 (`routes/dashboard.ts:7`, `plugins/auth.ts:8`).
