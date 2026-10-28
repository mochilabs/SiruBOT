# antislop 수정 브랜치 통합 리포트

MERGED: 11 / CONFLICTS: 8 / REVERTED: 0

- 통합 브랜치: `fix/integration` (워크트리 `/home/seonu/.local/share/opencode/worktree/e08104/fix-integration`)
- 기준 커밋: `13c323f5` (Merge PR #125 refactor/codebase-cleanup)
- 작업 일자: 2026-10-23
- push: 없음. 전부 로컬 커밋. `fix/integration`은 upstream 미설정.
- 충돌 해소 원칙: ai-slop-cleaner 스킬의 행동 보존·삭제 우선 원칙.

## 병합 순서와 결과

| # | 브랜치 | 커밋 | 충돌 | 해소 요약 |
|---|--------|------|------|-----------|
| 1 | fix/utils | b86cc62d | 없음 | packages/utils export 제거 6종 + 주석 정리 + 테스트 보강 |
| 2 | fix/data-api-services | 65fca5c6 | 없음 | 1번의 export 제거에 의존하는 re-export 정리 포함. utils 선행 병합으로 통과 |
| 3 | fix/data-api-routes-prisma | 7aba664f (29e531b7 포함) | 없음 | data-api routes 정리 + prisma 스키마·마이그레이션 주석 |
| 4 | fix/server-apps | 35ea0499 | 없음 | shardmanager/storage/notifier 감사 수정 |
| 5 | fix/bot-audio-games | a592953d | 없음 | bot audio/voice/games 모듈 |
| 6 | fix/bot-general-core | 905688db | 없음 | bot general/core/services |
| 7 | fix/dashboard-lib-contracts | 0da70a1c | 없음 | dashboard lib/hooks + shardclient ws-types + app-kit |
| 8 | fix/dashboard-ui | f5fcf986 | 없음 | components ui 계열 + globals.css 토큰 |
| 9 | fix/dashboard-app | 512046c6 | 없음 | app/ 페이지 + dataApiFailResponse 폴백 통일 소비처. globals.css는 자동 병합으로 토큰(fix/dashboard-ui)과 섹션 주석 평문화(fix/dashboard-app) 둘 다 유지 |
| 10 | fix/dashboard-features | ad913be8 | 없음 | servers/player/playlists/home 컴포넌트 |
| 11 | fix/social-alerts | 746dd676 (f5332ebd 포함) | 8파일 | 아래 충돌 해소 상세 참조 |

병합 11 이후 후속 수정 커밋 2건 (충돌 해소 보완):

- `bf868850` fix: 소셜 라우트 실패 응답의 메시지 치환 위치를 dataApiFailResponse 인자로 이동
- `01501680` fix: dataApiUserMessage fallback을 string|null로 확장

## 충돌 해소 상세 (전부 fix/social-alerts 병합 시점)

### app/api/servers/[id]/social/** 6개 route

충돌 파일: chzzk/profile, chzzk/search, subscriptions, subscriptions/[subId], twitch/resolve, youtube/resolve.

- 두 변경 모두 살림. 상태 코드는 fix/dashboard-app의 새 계약(fix/dashboard-lib-contracts의 dataApiFailResponse: 4xx는 upstream 유지, 5xx/네트워크는 502)을 따르되, 메시지 치환은 fix/social-alerts의 dataApiUserMessage를 유지.
- 최종 패턴 (예시는 youtube/resolve):

```ts
if (!result.ok) {
  return dataApiFailResponse({ ...result, message: dataApiUserMessage(result.message, null) }, FALLBACK);
}
```

- fix/social-alerts의 원래 응답(`status: result.message ? result.status : 502`)은 상태 코드 규칙에서 fix/dashboard-app 계약으로 대체했다. 메시지가 없을 때 social-alerts는 502를 돌려줬으나 새 계약은 upstream 4xx를 유지한다.
- import에 dataApiFailResponse와 dataApiUserMessage를 함께 남겼다.

### components/servers/social-alerts-settings.tsx

- 충돌은 sampleFor 1곳. fix/dashboard-features 쪽(SAMPLE_URLS 기반 + export + JSDoc)을 채택했다. fix/social-alerts의 example.com 하드코딩 URL은 버렸다. 근거: 자동 병합으로 살아난 template-editor.tsx의 SAMPLE_URLS(플랫폼 형태 자리 표시 URL)가 같은 "실제 URL 오인 방지" 의도를 이미 충족하고, fix/dashboard-features가 만든 social-alerts-settings.test.ts가 SAMPLE_URLS와 sampleFor export에 의존한다.

### components/servers/social/add-subscription-form.tsx

- 충돌 4곳 + 자동 병합 잔재. fix/social-alerts 재작업본(라디오그룹 플랫폼 선택, 탭 타깃 h-11, 접근성 라벨, Card variant="muted")을 기반으로 fix/dashboard-features의 SAMPLE_URLS 샘플 URL 수정 3곳(chzzk/youtube/twitch, TemplateEditor 폴백)을 재적용했다.
- 재작업이 도입한 `const SAMPLE_URL = "https://www.example.com/live"` 상수는 모든 사용처가 SAMPLE_URLS로 교체돼 미사용이 되어 삭제했다 (삭제 우선 원칙).
- webhookName placeholder는 양쪽 모두 em dash(U+2014) 치환을 했고, 재작업본(괄호 앞 공백 `기본: 시루 소셜 알림 (이름)`)을 유지했다.

### 자동 병합으로 충돌 없이 양쪽 변경이 모두 유지된 파일

- apps/dashboard/src/lib/data-api/client.ts: fix/dashboard-lib-contracts의 requireDataApi/readForwardFail + fix/social-alerts의 dataApiUserMessage. 모두 유지.
- apps/dashboard/src/components/servers/social/template-editor.tsx: fix/dashboard-features의 SAMPLE_URLS 내보내기 + fix/social-alerts의 재작업.
- apps/dashboard/src/app/globals.css (병합 9): fix/dashboard-ui의 토큰 6종(outline-fill, input-group-fill, invalid-ring, destructive-focus-fill 등) + @theme inline 매핑과 fix/dashboard-app의 섹션 주석 평문화가 모두 유지됐다.

### 충돌 해소 후 회귀 테스트가 잡아낸 이슈 2건 (수정 완료)

1. fix/social-alerts의 `[subId]/route.test.ts` 회귀 테스트 2건 실패: dataApiFailResponse는 `fail.message ?? fallback`이라 upstream 기술 원문(예: "Route DELETE:/v1/... not found")이 있으면 dataApiUserMessage 폴백을 무시했다. 메시지 치환을 dataApiFailResponse 인자의 선변환(`dataApiUserMessage(result.message, null)`)으로 옮겨 해결 (bf868850).
2. 선변환 방식이 `dataApiUserMessage(message, fallback: string)` 시그니처와 맞지 않아 dashboard typecheck가 9개 에러로 실패. fallback을 `string | null`로 넓히고 반환도 `string | null`로 변경 (01501680). 소비처는 병합된 6개 route와 client.test.ts뿐이라 안전.

## 최종 게이트 결과 (워크트리에서 실제 실행한 명령과 결과)

사전 준비: `yarn install` (성공, warnings only), `yarn generate` (성공).

| 게이트 | 명령 | 결과 |
|--------|------|------|
| lint | `yarn lint` | 10/10 성공 (turbo). dashboard = eslint, 그 외 = prettier --check |
| typecheck | `yarn typecheck` | 14/14 성공 (turbo, 의존 build/generate 포함) |
| test | `yarn test` | 14/14 성공. 워크스페이스별: bot 50파일/531건, utils 31/325, dashboard 49/285, data-api 28/204, notifier 15/131, storage 8/31, app-kit 4/29, shardmanager 3/27, shardclient 2/10. 합계 190개 파일 / 1,573개 테스트 전부 통과 (prisma는 테스트 없음) |

중간 단계별 확인 (각 병합 직후 turbo filter 실행): utils+data-api 린트/테스트, 4개 서버앱 린트/테스트, bot 린트/테스트, shardclient ws-types 변경 후 shardmanager+dashboard typecheck, dashboard 린트/테스트. 모두 통과했고 최종 전체 게이트에서도 동일하게 통과했다.

환경 주의사항 확인: `yarn workspace <pkg> test` 미사용. `PATH="$PWD/node_modules/.bin:$PATH"` 접두 또는 `yarn turbo ... --filter=...`로 실행해 `command not found: vitest|prettier` 문제를 피했다.

## 남은 리스크

### 메인 트리 사용자 미커밋 파일과의 병합 주의

메인 트리에 uncommitted로 존재하는 아래 파일이 이 통합 브랜치와 병합되면 충돌 가능성이 있다:

- `apps/bot/src/services/chatTts.ts`: fix/bot-general-core가 bot services를 손댔다. 병합 시 해당 파일 diff를 함께 확인할 것.
- `packages/prisma/src/schema.prisma`: fix/data-api-routes-prisma가 주석만 정리했다. 사용자 변경이 주석 영역과 겹치면 주석 슬롭이 다시 들어갈 수 있다.

### 동작 변경 항목 (병합으로 최종 트리에 들어간 것)

- data-api 실패 응답 상태 코드: 소셜 API 6개 route가 4xx는 upstream 상태 유지, 5xx/네트워크는 502로 통일. 메시지는 한글 안내만 노출하고 기술 원문은 각 라우트의 한국어 폴백으로 치환.
- dataApiUserMessage 시그니처: fallback `string | null` 허용, 반환 `string | null` (01501680).
- 웹훅 기본 이름 placeholder: em dash 표기에서 괄호 표기(`기본: 시루 소셜 알림 (이름)`)로 변경.
- 프로필 상태 표시: 게임 기록 없음의 "-" 플레이스홀더가 안내 문구(가위바위보 시작 안내)로 교체 (fix/dashboard-app, profile-view.tsx).
- 카드 색상: data-api 카드 렌더러(profileCardDark, profileCardTicket, nowPlayingCard, memberGreetingCard, ohaasaCard)의 색상·대비 수정.
- 포커스 링: 라이트 모드 --ring이 --brand(#ee6f8b)에서 대비 확보값 #c4476a로 변경 (fix/dashboard-ui). 다크 링은 --brand 유지.
- ws-types 계약: packages/shardclient/ws-types 정리(ShardClientError 삭제 포함) → shardmanager 소비까지 typecheck로 검증 완료.
- export 제거 6종: packages/utils에서 미사용 export 제거. fix/data-api-services의 re-export 정리가 이에 의존해 utils 먼저 병합 후 통과 확인.
- 소셜 설정 패널: 플랫폼 선택이 라디오그룹 카드로 재작업, 탭 타깃 h-11, 접근성 라벨(닫기 aria-label 등) 추가 (fix/social-alerts 재작업 기반).

### 검증하지 않은 것

- 런타임(실제 Discord 연동, data-api 연동) 동작은 검증하지 않았다. 단위 테스트·lint·typecheck까지만 실행.
- `yarn build`는 실행하지 않았다 (요청 게이트는 lint/typecheck/test).
