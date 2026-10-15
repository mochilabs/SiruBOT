# dashboard API Route 계약

> **기준일**: 2026-10-15

상위 흐름은 `./architecture.md` (`4.3 apps/dashboard`, `6.2 Redis request/reply`) 참조. 본 문서는 `apps/dashboard/src/app/api/**/route.ts` 실측 **35개** 기준이다 (이전 조사 32개는 stale).

## 3계층 구조

브라우저 → **API Route** (인증·권한·rate-limit·zod) → **DB 직결 / data-api / shardmanager**. 비밀 키는 서버 전용 — 클라이언트 번들에 절대 노출하지 않는다 (`apps/dashboard/src/lib/data-api.ts:38-57`).

인증은 next-auth Discord OAuth (`apps/dashboard/src/lib/auth.ts`): `identify guilds` 스코프, JWT 세션 24시간, `issuer: https://discord.com` 고정.

## 라우트 그룹별 표

| 그룹 | 라우트 | 비고 |
|---|---|---|
| 인증 | `auth/[...nextauth]` | next-auth 핸들러 |
| 즐겨찾기 | `favorites` | DB 직결 |
| 플레이리스트 (5) | `playlists`, `playlists/search`, `playlists/[id]`, `[id]/tracks`, `[id]/reorder` | DB 직결 |
| 서버 목록·설정 (6) | `servers`, `servers/[id]/settings`, `channels`, `roles`, `stats`, `bot-profile` | channels/roles는 data-api 봇 캐시 프록시 |
| AI (2) | `servers/[id]/ai`, `ai/history` | DB 직결 |
| 커스텀 명령어 (3) | `custom-commands`, `custom-commands/draft`, `custom-commands/[cmdId]` | draft는 data-api LLM |
| 그리팅 (6) | `greeting`, `greeting/background`, `greeting/layer-image`, `greeting/preview`, `greeting/status`, `greeting/test` | 이미지·테스트는 data-api 경유 |
| JTC (1) | `jtc/setup` | data-api→봇 수행 (마커 채널은 봇 토큰 필수) |
| 플레이어·라이브 (7) | `live`, `live/stream`, `player`, `player/command`, `player/play`, `player/search`, `player/voice-context` | data-api request/reply 프록시 |
| 기타 (3) | `tracks`, `data-api` (상태 프록시), `shards` (관리자 전용) | — |

## 권한·rate-limit·zod

- 권한 (`apps/dashboard/src/lib/api-guards.ts:19-60`): `authorizeGuildManage` (관리 권한, 실패 401/403/502) · `authorizeGuildMember` (멤버) · `authorizeDashboardAdmin` (shards 전용). Discord 장애(429/5xx)는 `unavailable`→502로 분류해 404 오판 방지.
- rate-limit (`apps/dashboard/src/lib/rate-limit.ts:11-17`): 쓰기 12/분·읽기 30/분·무거운 쓰기(채널 생성) 5/분·이미지 렌더 60/분. Redis 슬라이딩 윈도우, 서버 시각은 Lua `TIME`.
- zod (`apps/dashboard/src/lib/schemas.ts`): snowflake 정규식 `^\d{17,20}$`, AI 모드·반복 모드 enum, 볼륨 상한 `PLAYER_VOLUME_MAX`. 대표 예시 `settings/route.ts:10` (`ALLOWED_KEYS` 화이트리스트).

## SSE 프록시 특성

`live/stream`은 인가 뒤 data-api SSE를 그대로 relay — **rate-limit 미적용**(장기 연결), 미설정/장애는 502로 통일해 클라이언트가 폴링 폴백 (`apps/dashboard/src/app/api/servers/[id]/live/stream/route.ts:6-12`). data-api 클라이언트도 SSE에 `AbortSignal.timeout`을 걸지 않는다 — 타임아웃이 연결 전체를 잘라버리기 때문 (`apps/dashboard/src/lib/data-api.ts:72-75`).

## SHARD_MANAGER_AUTH_KEY 규칙

폴백 없음 — 미설정 시 throw 후 `fetchShards()` null 반환 (`apps/dashboard/src/lib/shard-api.ts:24-31`). data-api 키의 `AUTH_KEY` 폴백과 혼동 금지.
