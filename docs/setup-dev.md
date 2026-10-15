# 개발 환경 온보딩

> **기준일**: 2026-10-15

상세 구조·계약은 `./architecture.md`, 루트 빠른 시작은 `../README.ko.md:49-183` 참조. 아래는 검증된 최소 순서다.

## 전제

- Node.js 22 이상, Yarn 4.12.0 (Corepack 관리) — `README.ko.md:51-56`
- PostgreSQL, 디스코드 봇 토큰, Lavalink 서버 — `README.ko.md:51-56`

## 순서

1. `yarn install` — 의존성 설치.
2. `yarn generate` — **typecheck/build 전 필수** (Prisma 클라이언트 생성). `turbo.json:5-7`의 `build`는 `^generate`에 의존한다.
3. per-app `.env` 작성 — 각 `apps/*/.env.example`을 복사 (4개 전부 실존 확인: `bot`·`dashboard`·`data-api`·`shardmanager`). 비밀값은 커밋 금지.
4. `yarn dev` — 전체 실행. 단일 앱은 `turbo dev --filter=@sirubot/bot` 형식 (`README.ko.md:168-181`).
5. `yarn workspace @sirubot/prisma migrate:dev` — DB 마이그레이션 (`README.ko.md:158`).

## 포트

| 앱 | 포트 | 근거 |
|---|---|---|
| dashboard | 3000 | `NEXT_PUBLIC_APP_URL=http://localhost:3000` (`README.ko.md:82`) |
| shardmanager | 3001 | `SHARD_MANAGER_URL=http://localhost:3001`, `Dockerfile:219` (`EXPOSE 3001`) |
| data-api | 3002 | `PORT=3002` 기본 (`apps/data-api/.env.example`), `README.ko.md:112` |

주의: `apps/shardmanager/.env.example`의 `PORT=3000`은 실제 운영 포트(3001)와 다르다 — 예시 스텁이므로 3001로 맞춰 쓸 것.

## env 핵심

- `LAVALINK_HOSTS`: `id_host_port[_password]` 콤마 목록 (예 `main_localhost_2333_youshallnotpass`). 파서는 `packages/utils/src/lavalinkHosts.ts:4-34`, 형식 오류 시 기동 전 throw.
- data-api 키: `DATA_API_AUTH_KEY ?? AUTH_KEY` — 3개 앱이 같은 키 공유, `Authorization` 헤더에 Bearer 없이 원문. 값 예시는 각 `.env.example` 참조 (본 문서에 비밀값 기재 금지).
- 키 미설정 시 대시보드는 data-api 호출을 전면 스킵한다 (`apps/dashboard/src/lib/data-api.ts:38-57`).

## 수동 명령어 동기화

`REGISTER_COMMANDS=true`면 기동 시 덮어쓰기, 아니면 콘솔 로그만 (`AGENTS.md` Commands). 수동 동기화:

```bash
yarn dlx tsx scripts/register-commands.ts [--dry-run] [--global|--guild <id>]
```

스크립트 원본 `scripts/register-commands.ts:1-30`, 길드 기본값은 `GUILD_ID`/`DEV_GUILD_IDS`.

## 검증 명령

| 명령 | 비고 |
|---|---|
| `yarn lint` / `yarn lint:fix` | dashboard는 `eslint . --max-warnings=0`, 나머지는 prettier check |
| `yarn typecheck` | turbo 의존성 포함 — bare `tsc` 먼저 돌리지 말 것 |
| `yarn test` | per-workspace `vitest run --passWithNoTests` |

주의: dashboard `dev`는 `--webpack`, `build`는 `--turbopack` (`apps/dashboard/package.json:6-7`).
