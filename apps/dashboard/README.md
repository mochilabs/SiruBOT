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

## AutoMix

서버 설정의 **오디오 엔진**에서 **AutoMix (비트 맞춤)**을 켜고 저장하면 재생 중인 믹서에도 적용돼요. 관리자 길드 상세 화면에서도 같은 설정을 바꿀 수 있어요.

- AutoMix를 켜면 크로스페이드도 함께 켜져요. 크로스페이드를 끄면 AutoMix도 꺼지고, AutoMix만 끄면 크로스페이드는 유지돼요.
- 최대 템포 변경은 0~12% (기본 6%), 최소 분석 신뢰도는 0~1 (기본 0.30)이에요. 비트 분석이 어렵거나 템포 차이가 범위를 넘으면 일반 크로스페이드로 전환해요.
- 서버 설정 PUT과 관리자 PATCH는 `automixEnabled`, `automixMaxTempoChange`, `automixMinConfidence`를 받아요. 템포는 비율로 전달해요 (`0.06` = 6%). 동일 요청에 `crossfadeEnabled: false`가 있으면 AutoMix도 꺼져요.

배포 전에 Prisma Guild의 AutoMix 필드 세 개를 DB에 반영하고 클라이언트를 생성해야 해요. 봇과 대시보드를 함께 배포하고, Lavalink에는 BPM 분석과 비트 맞춤을 지원하는 mixer 플러그인이 필요해요. 설정 저장은 봇에 `mixer` 설정 변경 알림을 보내며, 실제 Discord 음성 재생 검증은 별도로 필요해요.
