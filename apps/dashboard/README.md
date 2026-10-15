# @sirubot/dashboard

SiruBOT 웹 대시보드 (Next.js 16 App Router). 서버 설정·플레이리스트·라이브 플레이어·AI·그리팅·JTC 관리 UI.

## 스크립트

| 명령 | 동작 |
|---|---|
| `dev` | 개발 서버 (`--webpack`) |
| `build` | 프로덕션 빌드 (`--turbopack`) |
| `start` | 프로덕션 실행 |
| `lint` / `lint:fix` | `eslint . --max-warnings=0` |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run --passWithNoTests` |

원본: `package.json:5-13`. `dev`는 `--webpack`, `build`는 `--turbopack` 고정.

## 환경 변수

`.env.example`을 복사해 `.env` 작성 — DATA_API/SHARD_MANAGER 키 계약 포함. 온보딩 전체 순서는 `../../docs/setup-dev.md`, API Route 계약은 `../../docs/api-dashboard.md` 참조.
