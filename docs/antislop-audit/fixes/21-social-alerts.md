FIXED: 4 / DEFERRED: 1 / N/A: 1

# FIX REPORT: 소셜 알림 (대시보드 UI 재작업 + 에러 경화)

- 브랜치: fix/social-alerts (워크트리 /home/sunshine/.local/share/opencode/worktree/e08104/fix-social-alerts)
- 커밋: f5332ebd `fix(dashboard): 소셜 알림 API의 upstream 기술 메시지 사용자 노출 차단`, 746dd676 `feat(dashboard): 소셜 알림 설정 패널을 다른 설정 패널 관례로 재작업` (push 없음)
- 수정 범위: apps/dashboard의 소셜 알림 관련 파일과 공용 data-api client 헬프터만 수정. 다른 영역은 손대지 않음.

## 404 루트 코트 요약

알림 구독 DELETE 404의 원인은 코드 결함이 아니라 실행 환경의 구버전 빌드다. 구독 삭제 경로(소유 검증 + DELETE 위임)는 커밋 f149c74d(2026-10-22 19:44, "fix: 허브 서명 검증·소유권 검증과 에러 로깅 보강")에서 추가됐고, 사용자의 실행 중 빌드는 그 이전이었으므로 Fastify 라우터가 `Route DELETE:/v1/... not found` 404를 반환했다. 현재 소스에는 라우트가 존재하며, 이번 검증에서 `apps/notifier/src/routes/social.test.ts` 11/11 통과를 확인했다 (삭제 경로 테스트 2건: 소유 구독만 삭제하고 웹훅을 정리, 타 길드 구독 삭제는 IDOR로 404).

## 변경 파일 목록

### 커밋 f5332ebd (임무 A: 에러 경화)

| 파일 | 변경 |
| --- | --- |
| apps/dashboard/src/lib/data-api/client.ts | `dataApiUserMessage(message, fallback)` 헬프터 추가. upstream 메시지에 한글이 있으면 한국어 안내로 보고 그대로 통과, 영문/기술 포맷(Fastify `Route ... not found` 등)이면 라우트의 한국어 폴백으로 치환. 상태 코드 규칙(메시지 있으면 upstream 상태 유지, 없으면 502)은 기존 그대로 |
| apps/dashboard/src/app/api/servers/[id]/social/subscriptions/route.ts | 목록 GET·생성 POST의 실패 메시지 2곳을 헬프터로 정리 |
| apps/dashboard/src/app/api/servers/[id]/social/subscriptions/[subId]/route.ts | 소유 검증 GET·PATCH·DELETE의 실패 메시지 3곳을 헬프터로 정리 |
| apps/dashboard/src/app/api/servers/[id]/social/{chzzk/search,chzzk/profile,youtube/resolve,twitch/resolve}/route.ts | 각 라우트의 실패 메시지 1곳씩(총 4곳) 정리 |
| apps/dashboard/src/lib/data-api/client.test.ts | 헬프터 계약 테스트 2건 추가 (한글 안내 통과, 기술 원문·null·공백은 폴백) |
| apps/dashboard/src/app/api/servers/[id]/social/subscriptions/[subId]/route.test.ts (신규) | DELETE 경로 집중 테스트 5건. Fastify 기술 메시지 404가 한국어 폴백으로 바뀌고 상태는 유지, upstream 한국어 안내는 그대로 전달, 소유 목록 확인 실패 시 위임 없이 한국어 안내로 차단, 타 길드 구독 404, 성공 경로 DELETE 위임 검증 |

임무 A 테스트 결과: 신규 테스트 7건 전부 통과 (client.test.ts 2건 + route.test.ts 5건). 대시보드 전체 스위트도 38파일/254테스트 전부 통과.

### 커밋 746dd676 (임무 B: UI 재작업)

| 파일 | 변경 |
| --- | --- |
| apps/dashboard/src/components/servers/social-alerts-settings.tsx | 루트를 Card + PanelHeader 구조로 통일. 로딩(PanelLoading)/오류(PanelError)/빈 목록(EmptyState + 추가 CTA) 3상태 도입. 구독 목록을 ul/li 행 + 아이콘 버튼(aria-label)으로 정리, 삭제는 useConfirmDelete 무장 아이콘 패턴으로 통일. 웹훅 표시명 편집을 Field 프리미티브로 연결. 미리보기 샘플 URL을 예약 도메인 example.com으로 통일 |
| apps/dashboard/src/components/servers/social/add-subscription-form.tsx | 플랫폼 선택을 AI·채팅유틸 패널의 radiogroup 카드(체크 배지, focus-visible 링) 패턴으로 교체. 폼 루트를 Card variant=muted 인셋 서피스로 통일. 알림 채널·웹훅 표시명을 Field로 래핑(라벨 연결). 웹훅 표시명 placeholder의 em dash 제거. 채널 찾기·확인·제출 버튼에 터치 타깃 보강, 추가 버튼은 Button loading 속성 사용. 미리보기 샘플 URL을 example.com으로 통일 |
| apps/dashboard/src/components/servers/social/template-editor.tsx | 변수 삽입 칩을 raw button에서 Button(size=xs, secondary)로 교체하고 터치 타깃 보강. 미리보기 박스·오류 문구를 토큰(radius·border-subtle·font-medium)에 맞춤. 기존 테스트 계약(버튼 리터럴·미리보기 치환)은 그대로 통과 |

## UI 재작업: 패널 관례를 어떻게 맞췄나

기준으로 같은 디렉터리의 custom-commands-settings(목록형), ai-settings·chat-tools-settings(radiogroup 카드), bot-profile-settings(아바타 업로드)를 읽고 맞췄다.

- 루트 구조: `<section>` 루트를 `Card padding="lg"` + `PanelHeader`(아이콘 `h-5 w-5`, 액션 슬롯)로 통일
- 3상태: PanelLoading(초기 로딩), PanelError(불러오기 실패, 재시도 버튼과 401 재로그인 분기), EmptyState(빈 목록 설명 + "알림 추가" CTA)
- 목록 행: 커스텀 명령어 패널과 동일한 `<ul className="space-y-2">` + `li rounded-menu bg-surface-2 px-4 py-3`. 액션은 아이콘 버튼에 aria-label 부착, 삭제는 2클릭 무장 아이콘 + `ring-2 ring-destructive/50` 관례로 통일
- 플랫폼 선택: AI·채팅유틸 패널과 같은 `role="radiogroup"` 카드(선택 시 체크 배지)로 교체
- 라벨: 텍스트 스팬 라벨을 Field 프리미티브로 교체해 label과 입력의 실제 연결(htmlFor/aria-describedby)
- 토큰: `rounded-menu`/`rounded-control`/`border-border-subtle`/`bg-surface-*` 등 디자인 토큰만 사용, 하드코딩 색상 없음
- 터치 타깃: 주요 액션 버튼에 저장소 관례인 `pointer-coarse:h-11` 적용

유지한 기능: 구독 목록·생성·수정·삭제, 2클릭 삭제 안전장치, 일시정지/재개, 템플릿 에디터(변수 삽입·채널/역할 멘션·실시간 미리보기·문법 오류 표시), 웹훅 표시명·아바타 업로드·섬네일 토글, 플랫폼별 폼 동작(치지직 검색·링크/ID 바로찾기, 유튜브·트위치 채널 해석), 토스트 피드백, 봇 프로필 폴백 미리보기. 동작 변경은 2클릭 삭제를 아이콘 무장 패턴으로 바꾼 것뿐이다.

감사 세그먼트 08 반영: add-subscription-form.tsx:313 placeholder의 em dash 제거(08#1), 미리보기 샘플 URL의 릭롤·예시 주소를 예약 도메인 example.com으로 통일(08#10).

## 검증 (워크트리에서 실제로 실행한 명령만 기록)

이 환경에서는 `yarn workspace ...` 스크립트의 bin 경로 주입이 동작하지 않아(`command not found: vitest/tsup`) 동일한 루트 설정을 쓰는 바이너리를 직접 실행했다.

| 명령 | 결과 |
| --- | --- |
| `yarn install` (워크트리) | 성공 (10.2초, peer dep 경고만) |
| apps/dashboard: `../../node_modules/.bin/eslint . --max-warnings=0` | 문제 0 |
| apps/dashboard: `../../node_modules/.bin/vitest run --config vitest.config.ts` | 38파일/254테스트 전부 통과 |
| apps/notifier: `../../node_modules/.bin/vitest run --config ../../vitest.config.ts` | 14파일/127테스트 전부 통과 (social.test.ts 11/11, 삭제 경로 2건 포함) |
| packages/prisma: `prisma generate`, packages/utils: `tsup` (typecheck 선행 절차) | 성공 |
| apps/dashboard: `../../node_modules/.bin/tsc --noEmit` | 에러 0 |

미수행: 브라우저 실제 기동(dashboard dev 서버)과 클릭·모바일 폭·라이트/다크 렌더 검증은 하지 않았다. UI 변경의 동작 근거는 위 테스트와 코드 검사로만 확인했다.

## 병합 주의

- `apps/dashboard/src/lib/data-api/client.ts`는 여러 에이전트가 쓰는 공용 허브다. 이 브랜치 이전에도 머지 충돌로 수정된 전력(8c61bc6a)이 있다. fix/dashboard-features·fix/dashboard-app 브랜치가 같은 파일을 수정 중이면 충돌 가능성이 높다.
- `social-alerts-settings.tsx`와 `social/**`(add-subscription-form·template-editor)는 이번 브랜치에서 구조를 크게 바꿨다(263 insertions/201 deletions). 같은 패널을 만진 다른 브랜치가 있으면 rebase 시 충돌 자체 해결보다 재작업본 기준 재적용이 안전하다.
- 소셜 API 라우트 6파일의 변경은 메시지 처리 한 줄씩이라 충돌이 나도 해석이 쉽다.
