# 프로덕션 운영 런북

> **기준일**: 2026-10-15

아키텍처·계약 상위는 `./architecture.md`, env 전체 매트릭스는 `./architecture.md#10-환경변수-매트릭스` 참조. 본 문서는 운영 동작만 다룬다.

## Docker 빌드·실행

- 최종 타겟 4개 (`Dockerfile:100,150,187,229`): `bot`·`dashboard`·`shardmanager`·`data-api`. 빌드 스테이지(`builder-bot` 등 4개)는 중간 산출물이다.
- 컴포즈 파일 3개 (`docker/`): `docker-compose.yml`·`docker-stack.yml`·`docker-stack-infra.yml`.
- 봇 기동 시 `prisma migrate deploy` 자동 실행 (`Dockerfile:145`).

## 필수 env (프로덕션)

- `SHARD_MANAGER_URL` 없으면 봇은 즉시 종료 (`apps/bot/src/core/bootstrap.ts:27-31`). 개발 모드는 단독 실행 (`shards: [0]`, `bootstrap.ts:22`).

## 롤링 업데이트·샤드 장애 대응

- 봇 identify는 `NoShardsAvailableError` 시 `SHARD_IDENTIFY_RETRY_MS`(기본 5초, 최소 1초)로 무한 재시도 — 구 프로세스가 슬롯을 놓을 때까지 기다린다 (`apps/bot/src/core/bootstrap.ts:40-57`).
- `ShardClient.identify()` 자체도 연결 실패 시 5초 재시도, `IDENTIFY_ACK` 10초 타임아웃 (`packages/shardclient/src/client.ts:42-62,104-108`).
- 연결 끊김 후 재접속은 지수 백오프 1s→2s→…→상한 30s (`packages/shardclient/src/client.ts:71-91`).
- shardmanager는 `ShardRegistry` + `DiscordNotifier`(웹훅)로 할당·장애를 추적한다 (`apps/shardmanager/src/server.ts:29`).

## 종료 순서

- 봇 (`apps/bot/src/core/bootstrap.ts:99-153`): Lavalink 세션 저장 → 오디오 리스너·Redis 구독 서비스 정지 → pending 저널 flush → Redis 해제 → DB 해제 → 게이트웨이 destroy → shardClient destroy.
- data-api (`apps/data-api/src/server.ts:78-90`): 스케줄러 2종 정지 → player/bot-profile/greeting/guild-data/player-web/jtc 6개 허브 정지 → Redis 해제 → DB 해제 → Fastify close.
- shardmanager (`apps/shardmanager/src/server.ts:69-77`): registry destroy → Fastify close.

## Redis 미연결 시 메모리 폴백의 의미

- data-api `sharedCache`는 Redis 없으면 프로세스 내 `Map` 폴백 (`apps/data-api/src/utils/cache.ts:11,25`) — **큐·세션·캐시가 휘발**된다. 다중 레플리카면 인스턴스마다 따로 논다.
- 봇 Redis 구독 서비스는 실패해도 부팅 계속 — 해당 대시보드 연동만 타임아웃 폴백 (`apps/bot/src/core/bootstrap.ts:182-199`). 장애 대응 시 "봇은 살아 있으나 연동이 끊긴 상태"임을 인지할 것.

## 헬스체크

| 대상 | 엔드포인트 | 근거 |
|---|---|---|
| 봇 | `HEALTH_PORT`(기본 8080) `/` — 200/503 상태 코드 판정 | `apps/bot/src/core/bootstrap.ts:224-248`, `Dockerfile:140-141` |
| data-api | `/api/health` (인증 면제 유일 경로) | `apps/data-api/src/routes/index.ts:107`, `Dockerfile:268` |
| shardmanager | `/api/health` → `{ ok: true }` | `apps/shardmanager/src/routes/api/health/health.ts:3-7` |
| dashboard | TCP 3000 | `Dockerfile:179-180` |

봇 헬스는 READY 이후 2분 재연결 유예 내에는 200을 유지해 재시작 증폭을 막는다 (`apps/bot/src/core/bootstrap.ts:239-242`).
