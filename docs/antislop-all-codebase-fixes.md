# antislop 감사 수정 결과 전체 리포트 (fix 통합본)

- 날짜: 2026-10-23
- 감사 원문: `docs/antislop-all-codebase.md` (246건, 20개 세그먼트)
- 개별 수정 리포트: `docs/antislop-audit/fixes/01~21*.md` (11개)
- 통합 리포트: `docs/antislop-audit/fixes/00-integration.md`
- 산출 브랜치: `fix/integration` (fix 브랜치 11개 통합, push 없음, 기준 `13c323f5`)

## 최종 집계

- 감사 246건: **FIXED 231 / DEFERRED 13 / N/A 2**
- 소셜 알림 별도 과제(404 에러 경화 + UI 재작업) 6단위: **FIXED 4 / DEFERRED 1 / N/A 1**

| 브랜치 | 커밋 | 범위 | F / D / N |
|---|---|---|---|
| fix/utils | b86cc62d | packages/utils (세그먼트 15~17) | 32 / 2 / 1 |
| fix/data-api-services | 65fca5c6 | data-api services/providers/renderers (11) | 27 / 0 / 0 |
| fix/data-api-routes-prisma | 29e531b7, 7aba664f | data-api routes + prisma (10, 18) | 20 / 2 / 0 |
| fix/server-apps | 35ea0499 | shardmanager/storage/notifier (12~14) | 26 / 1 / 1 |
| fix/bot-audio-games | a592953d | bot modules audio/voice/games (01, 03) | 12 / 4 / 0 |
| fix/bot-general-core | 905688db | bot general/core/services (02, 04) | 28 / 2 / 0 |
| fix/dashboard-lib-contracts | 0da70a1c | dashboard lib/hooks + shardclient + app-kit (09, 19, 20) | 26 / 1 / 0 |
| fix/dashboard-ui | f5fcf986 | components ui 계열 + globals.css (07) | 15 / 1 / 0 |
| fix/dashboard-app | 512046c6 | dashboard app/ (05, 06) | 29 / 0 / 0 |
| fix/dashboard-features | ad913be8 | components servers/player/playlists/home (08) | 16 / 0 / 0 |
| fix/social-alerts | f5332ebd, 746dd676 | 소셜 API 에러 경화 + 소셜 UI 재작업 | 4 / 1 / 1 |

## 통합 결과 (fix/integration)

- MERGED 11 / CONFLICTS 8 / REVERTED 0, 전부 로컬 머지 커밋.
- 병합 1~10은 충돌 없음. globals.css(8+9)와 lib/data-api/client.ts(7+11)는 예상과 달리 자동 병합으로 양쪽 변경이 모두 유지됨.
- 충돌 8파일은 전부 `fix/social-alerts` 병합에서 발생: 소셜 API route 6 + social-alerts-settings + add-subscription-form.
  - 소셜 API: 상태 코드는 `fix/dashboard-app` 계약(4xx upstream 유지, 5xx/네트워크 502), 메시지는 `dataApiUserMessage` 치환 유지.
  - 소셜 UI: 재작업본을 기반으로 `fix/dashboard-features`의 SAMPLE_URLS 재적용.
- 해소 중 회귀 테스트가 이슈 2건을 잡아 수정(`bf868850`, `01501680`): `dataApiFailResponse`가 기술 원문 메시지를 폴백보다 우선하던 문제, `dataApiUserMessage`의 null fallback 처리.

## 최종 게이트 (워크트리에서 실제 실행)

- `yarn lint` 10/10, `yarn typecheck` 14/14, `yarn test` 14/14 task
- 테스트 190파일 / 1,573건 전부 통과 (bot 531, utils 325, dashboard 285, data-api 204 등)

## DEFER 13건 (별도 결정 필요)

| 세그먼트# | 등급 | 사유 |
|---|---|---|
| 01#1 | MEDIUM | 볼륨 죽은 코드: `controllerButton.test.ts`가 동작을 잠금(삭제 시 게이트 붕괴), 버튼 재노출도 유저 화면 변경이라 제품 결정 필요 |
| 01#6 | LOW | 유저 이모지 표기 통일: 유저 노출 문자열 변경 + 앱 이모지 자산이 범위 밖 |
| 01#8 | LOW | queueAdvancer/playbackWatchdog 전이 로직 테스트: 목·이벤트 스크립트 비용 |
| 04#5 | MEDIUM | 응답자 `stop()` 7곳 공용 헬퍼: private 필드 null-아웃을 캐스터로 강요해 간접층만 추가 (로거 타입 8곳만 `ServiceLogger`로 통일함) |
| 04#13 | LOW | 미테스트 파일 45개: 범위·비용이 커 별도 과제 |
| 07#15 | LOW | 공용 헬퍼 추출: "새 추상화 금지" 원칙과 충돌, 동시 변경 회귀 위험 |
| 09#11 | LOW | notify.ts의 lib → components 역방향 import: components 12곳 수정이 선행돼야 |
| 18#1, #2 | MEDIUM | prisma 중복 인덱스 제거 2건: 스키마 변경 + `DROP INDEX` 마이그레이션 필요 |
| 12#8 | LOW | storage PUT 방어 분기 도달성: 응답 본문 확인 테스트가 선행, 제거는 방어선 제거라 별도 결정 |
| 15#13 | LOW | data-api 지역 `sleep` 제거: apps/data-api 소관 |
| 17#13 | LOW | greeting 스키마 size 하단 12px 상향: 기존 저장값 폴백 유실 위험 + 대시보드 에디터 제한과 연동 |

N/A 2건: 12#14(JSON 상태 로드/저장 3중 반복, 리포트의 유지 권고 존중), 16#2(CHAPTER_FETCH 상수는 utils 내 중복 없음).

## 동작 변경 항목 (리뷰 대상)

1. 웹훅 기본 이름: `시루 소셜 알림: {채널명}` (신규 구독만, 기존 웹훅 이름은 Discord 저장값이라 불변)
2. data-api 실패 응답 계약 정규화: 빈 메시지 4xx는 기존 502 대신 upstream 4xx 반환, 5xx/네트워크는 502 유지
3. upstream 기술 메시지(예: Fastify `Route ... not found`)를 사용자에게 노출하지 않고 한국어 폴백으로 치환
4. 프로필 presence 미관측 멤버: `online` 단정 제거 → `상태 알 수 없음` 표시
5. 시각: 카드/배지 색상 8종 대비 교체, 라이트 포커스 링 `#c4476a`, 배지 솔리드 채움, avatar 상태 aria-label 한국어화, 랭크 숫자 14px
6. `@sirubot/shardclient/ws-types` 공개 subpath 변경: `HeartbeatAckPayload` 삭제, 인터페이스 6종을 `z.infer` 별칭으로 파생 (저장소 밖 소비처가 있으면 컴파일 오류 가능)
7. export 제거 다수: utils 6종(외부 소비자 0건 grep 확인), notifier `getDb`, shardmanager `ShardClient` `broadcast()` 및 `ShardClientError` 등
8. 대시보드: `loading.tsx` 2라우트 추가, error 페이지 워터마크를 CSS blur 배경으로 교체, 갤러리 죽은 컨트롤 6개 연결, 404 이스터 6버튼 키보드 진입
9. data-api: chapters fetch 10초 타임아웃 추가, 허브 상관 로직 3파일 → `utils/hubCorrelate.ts` 통합

## 메인 트리 반영 방법

메인 작업 트리에는 사용자의 미커밋 변경이 남아 있고 그중 2개가 수정 범위와 겹칩니다: `apps/bot/src/services/chatTts.ts`, `packages/prisma/src/schema.prisma`.

1. 미커밋 작업을 커밋하거나 stash.
2. `git merge fix/integration` (단일 머지로 11개 fix 반영).
3. 위 두 파일 충돌 시 사용자 작업을 우선하고 fix 쪽 변경(chatTts export 키워드 2줄 제거, prisma 주석 정리)을 재적용.

## 알림 삭제 404 이슈 (별건)

원인은 코드가 아니라 실행 환경 구버전입니다. 구독 삭제 라우트 3층은 커밋 `f149c74d`(10-22 19:44)에서 추가됐고, 실행 중이던 빌드는 그 이전이라 Fastify 라우터 404가 났습니다. 현재 코드에서는 notifier `social.test.ts`의 삭제 경로가 통과함을 확인했습니다. 실행 환경 재시작/재배포가 실제 해결책입니다. 재발 방지로 기술 메시지 유출 차단(위 동작 변경 3번)을 반영했습니다.

## 미검증 항목 (정직 기록)

- 브라우저 런타임(실제 렌더링·클릭스루·모바일/테마 육안) 검증: 전 브랜치 미수행
- DB 연동 마이그레이션, Redis/봇 릴레이 HTTP 통합 테스트: 미수행
- 배포 환경 반영·재시작: 미수행 (사용자 판단 필요)
- Next.js 보안 업그레이드 권고(`next upgrade --agent=security`): 빌드가 표시했으나 범위 밖으로 미실행. 별도 확인 필요.
