# SiruBOT 문서 인덱스

> **기준일**: 2026-10-21 (파일 목록 검증)

## 파일 목록

| 문서 | 한 줄 설명 |
|---|---|
| `README.md` (이 파일) | 문서 인덱스·역할 분담·작성 규칙 |
| `architecture.md` | 시스템 컨텍스트·앱 상세·공유 계약·부팅/종료·환경변수 매트릭스의 기준 문서 |
| `pr-message-rule.md` | PR 제목·본문 작성 규칙: 유형별 본문 골격과 검증 기록 규칙 |
| `setup-dev.md` | 신규 온보딩: 설치→env→dev→마이그레이션 순서와 포트·스크립트 |
| `runbook-production.md` | 운영 런북: Docker 빌드·샤드 장애 대응·종료 순서·헬스체크 |
| `api-data-api.md` | data-api HTTP 계약: 인증·엔드포인트·TTL·에러 매핑·스케줄러 |
| `api-dashboard.md` | dashboard API Route 계약: 3계층·라우트 그룹·권한/rate-limit/zod |
| `3rdparty.md` | 서드파티 컴포넌트 계약: Lavalink 플러그인·클라이언트 라이브러리·외부 HTTP 서비스의 계약면과 업데이트 플레이북 |
| `codebase-audit.md` | 코드베이스 감사 리포트(2026-10-21): 154건 발견의 우선순위 통합·파일:라인 근거·수정 로드맵 |
| `refactor-plan.md` | 리팩토링 계획: 크로스커팅 중복 제거·워크스페이스별 분리·게이트웨이 잔재 정리의 단계별 로드맵 |
| `security/` | 보안 감사 기록(2026-10-17): SEC-001~010의 증거·영향·대응 권고 |
| `plans/` | 기능 기회·구현 계획/명세서 모음 (`YYYY-MM-DD-주제.md`, 각 하위 README 포함) |
| `screenshots/` | 문서에 첨부하는 UI 스크린샷 PNG 원본 |

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
