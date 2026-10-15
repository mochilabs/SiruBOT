# SiruBOT 문서 인덱스

> **기준일**: 2026-10-15

## 파일 목록

| 문서 | 한 줄 설명 |
|---|---|
| `README.md` (이 파일) | 문서 인덱스·역할 분담·작성 규칙 |
| `architecture.md` | 시스템 컨텍스트·앱 상세·공유 계약·부팅/종료·환경변수 매트릭스의 기준 문서 |
| `setup-dev.md` | 신규 온보딩: 설치→env→dev→마이그레이션 순서와 포트·스크립트 |
| `runbook-production.md` | 운영 런북: Docker 빌드·샤드 장애 대응·종료 순서·헬스체크 |
| `api-data-api.md` | data-api HTTP 계약: 인증·엔드포인트·TTL·에러 매핑·스케줄러 |
| `api-dashboard.md` | dashboard API Route 계약: 3계층·라우트 그룹·권한/rate-limit/zod |
| `plans/2026-10-14-dashboard-responsive-ux.md` | 반응형 UX·플로팅 저장 바 구현 계획 (pending) |
| `audits/2026-10-14-dashboard-ui-ux.md` | 대시보드 UI/UX 감사 + #77 구현 기록 (P2 2건 잔여) |

## 역할 분담

| 주체 | 역할 | 예시 |
|---|---|---|
| `AGENTS.md` (리포 루트) | 에이전트 코딩 규약 — 브랜치 규칙·명령어·봇 컨벤션·env 주의점 | 직접 수정은 규약 변경일 때만 |
| `.opencode/skills/*` (9종, `SKILL.md` 실존 확인) | 작업 템플릿 — `sapphire-command`·`sapphire-precondition`·`dashboard-conventions`·`design-tokens`·`ui-primitives`·`discord-patterns`·`scroll-effects`·`codebase-search`·`ai-slop-cleaner` | 봇/대시보드 작업 전 해당 skill 로드 |
| `docs/*` | 인간용 구조·계약·운영 문서 — "무엇이 어디에 있고 어떻게 호출되는가" | 계약 변경 시 코드와 함께 갱신 |

## "코드가 진실" 규칙

1. 계약 변경 시 코드와 문서를 함께 갱신한다 — 한쪽만 고치지 않는다.
2. docs의 동작 서술에는 코드 경로:라인 인용이 필수다 (`apps/data-api/src/routes/index.ts:107` 형식).
3. 중복 서술 금지 — `architecture.md`에 있는 내용은 복붙하지 말고 `./architecture.md#섹션` 링크로 참조한다.
