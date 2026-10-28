FIXED: 26 / DEFERRED: 1 / N/A: 0

# FIX 리포트: 세그먼트 09 (대시보드 lib/hooks) + 19 (shardclient) + 20 (app-kit)

- 수정일: 2026-10-23
- 브랜치: `fix/dashboard-lib-contracts` (워크트리 `/home/seonu/.local/share/opencode/worktree/e08104/fix-dashboard-lib-contracts`)
- 커밋: `0da70a1c` refactor: antislop 감사 09/19/20 세그먼트 finding 수정 (push 없음)
- 수정 범위: `apps/dashboard/src/{lib,hooks}/**`, `packages/shardclient/**`, `packages/app-kit/**` 한정. `packages/utils`와 `apps/dashboard/src/{app,components}`는 수정하지 않음

## Finding별 처리 내역

| 세그먼트#번호 | 심각도 | 상태 | 변경 요약 | 파일:라인(수정 후 기준) |
|---|---|---|---|---|
| 09#1 | MEDIUM | fixed | `readError`(use-social-alerts)와 `callApi` 인라인 추출(use-playlists)을 `lib/api-error.ts`의 `toApiError`로 통합. 401 실패는 `redirectToLogin()`을 호출해 다른 길드 훅과 같은 로그인 안내를 받도록 status 소실 문제를 함께 해결 | apps/dashboard/src/hooks/use-social-alerts.ts:56 (readError 삭제), apps/dashboard/src/hooks/use-playlists.ts:139 |
| 09#2 | MEDIUM | fixed | data-api client에 `requireDataApi`(키 미설정 경고)·`readForwardFail`(실패 본문 message 추출) 헬퍼를 두고 6개 함수 가드와 3개 함수 실패블록에서 호출. 경고 없이 null만 돌려주던 `postDataApi`·`openDataApiStream`도 같은 경고를 남김 | apps/dashboard/src/lib/data-api/client.ts:15,25 (호출부 :44,69,93,123,139,153,162,189,201) |
| 09#3 | MEDIUM | fixed | `writeCache` 안의 TTL 삼항을 `cacheTtlMs(result)` 호출로 교체해 TTL 원본을 한 곳으로. 캐시 수명 동일성 선언 주석도 현재 코드에 맞게 수정 | apps/dashboard/src/lib/guild-permissions.ts:60,84 |
| 09#4 | MEDIUM | fixed | api-handler의 schema 분기를 `parseSettingBody`로 통합(허용 키는 스키마 shape에서 추출, `invalidMessage` 인자 신설). 미등록 필드 400 회귀 테스트 1건 추가 | apps/dashboard/src/lib/api-handler.ts:95,134, apps/dashboard/src/lib/schemas.ts:151, apps/dashboard/src/lib/api-handler.test.ts:186 |
| 09#5 | MEDIUM | fixed | 전역 SWR 기본 fetcher를 `createApiFetcher` 위임으로 교체해 구현을 한 곳으로. 영문 throw를 제거하고 실패 시 ApiError(서버 한국어 메시지 우선) 계약으로 통일 | apps/dashboard/src/lib/fetcher.ts:7 |
| 09#6 | MEDIUM | fixed | rps·guess 집계에 표본 한도 고지 플래그 `rpsSampled`·`guessSampled` 추가(샘플이 한도에 걸리면 true). 타입은 선택 필드라 기존 소비처 컴파일 유지 | apps/dashboard/src/lib/profile-stats.ts:72,74,212,213 |
| 09#7 | LOW | fixed | 함수 시그니처만 반복하는 영문 JSDoc 2개 제거. 남은 `discordGuildIconUrl`에는 코드에 없는 사실이 없어 주석만 삭제 | apps/dashboard/src/lib/discord-cdn.ts:1 (주석 제거) |
| 09#8 | LOW | fixed | 트리에 존재하지 않는 옛 파일 참조만 주석에서 삭제하고 빈 문자열 폴백 사유는 유지 | apps/dashboard/src/lib/env.ts:23 |
| 09#9 | LOW | fixed | 전소스 미사용 `discordAvatarUrl` 삭제, 파일 내부 호출뿐인 `unknownKeys`·`insertTokenSetIfAbsent`·`writeTokenSetOptimistic`·`deleteTokenSet`의 `export` 제거(호출처 grep으로 0건 확인) | apps/dashboard/src/lib/discord-cdn.ts, apps/dashboard/src/lib/schemas.ts:131, apps/dashboard/src/lib/token-store.ts:144,166,186 |
| 09#10 | LOW | fixed | 제안된 지명 3모듈의 회귀 테스트 신규: notify(토스트 계약 5), storage(키 미설정 차단·한국어 메시지 전달 6), profile-stats(집계·sampled 플래그 2). 지명 밖 미테스트 모듈·훅은 이번 범위 밖 | apps/dashboard/src/lib/notify.test.ts:1, apps/dashboard/src/lib/storage.test.ts:1, apps/dashboard/src/lib/profile-stats.test.ts:1 |
| 09#11 | LOW | deferred | `notify.ts`를 hooks로 옮기거나 토스트 인자를 받는 순수 헬퍼로 바꾸려면 `@/components/ui/toast`를 import하는 components 12곳 호출부를 함께 고쳐야 하고, 그 디렉터리는 이번 수정 범위 밖이라 미정. 현 상태는 lib→components 역방향 import 유지 | apps/dashboard/src/lib/notify.ts:3 (미변경) |
| 19#1 | HIGH | fixed | fatal 경로 주석의 em dash(U+2014)를 마침표로 치환하고 재시도 금지 규칙 문구 유지 | packages/shardclient/src/client.ts:51 |
| 19#2 | HIGH | fixed | zod 검증 목적 주석의 em dash(U+2014)를 콜론으로 치환하고 깨진 payload 차단 근거 2줄 유지 | packages/shardclient/src/core/ws.ts:61 |
| 19#3 | HIGH | fixed | 자동 재연결 금지 주석의 em dash(U+2014)를 마침표로 치환하고 호출자 책임 규칙 유지 | packages/shardclient/src/core/ws.ts:73 |
| 19#4 | MEDIUM | fixed | 본문이 없는 HEARTBEAT_ACK 핸들러와 빈 라벨 주석·JSDoc·호출부를 함께 제거. 미등록과 동일 동작이라 행동 변화 없음 | packages/shardclient/src/client.ts:137 인접 (setupEventHandlers 제거) |
| 19#5 | MEDIUM | fixed | ws 페이로드 인터페이스 6종을 스키마 `z.infer` 타입 별칭으로 대체하고 `ShardStatus` 열거 리터럴을 스키마에서 파생 | packages/shardclient/src/ws-types/index.ts:36,49,53,56 |
| 19#6 | LOW | fixed | reidentify의 시그니처 반복 JSDoc 삭제. sendIdentify 문서와 재연결 JSDoc은 유지 | packages/shardclient/src/client.ts:93 (제거) |
| 19#7 | LOW | fixed | reportStatus의 시그니처 반복 JSDoc 삭제 | packages/shardclient/src/client.ts:151 (제거) |
| 19#8 | LOW | fixed | onStats의 시그니처 반복 JSDoc 삭제. 인터벌 정리 설명은 startStatsReporter 주석에 유지 | packages/shardclient/src/client.ts:163 (제거) |
| 19#9 | LOW | fixed | 아무 정보도 더하지 않던 `ShardClientError` 파일 삭제, `NoShardsAvailableError`가 `Error`를 직접 상속. 저장소 내 사용처 0건(grep)이며 패키지 exports 밖이라 깊은 import도 막혀 있음 | packages/shardclient/src/errors/NoShardsAvailableError.ts:1, errors/ShardClientError.ts (삭제) |
| 19#10 | LOW | fixed | 패키지 내 미사용 인터페이스 3종 처리: `HeartbeatAckPayload`는 저장소 내 소비처 0건이라 삭제, `IdentifyPayload`·`HeartbeatPayload`는 shardmanager가 쓰는 공개 타입이라 스키마 파생 별칭으로 통합 | packages/shardclient/src/ws-types/index.ts:36,49 (HeartbeatAckPayload는 원 41행, 삭제) |
| 19#11 | LOW | fixed | 제안 3경로 테스트 신규 4건: 핸드셰이크 성공, NoShardsAvailableError 조기 종료(60초 진행 후 재시도 없음 확인), 5초 백오프 재시도, ws close의 지수 백오프 재연결·재식별 | packages/shardclient/src/client.test.ts:107,120,135,151 |
| 20#1 | MEDIUM | fixed | app-kit logger 테스트에 utils `getLoggerSettings`와 minLevel·type을 비교하는 미러 동기화 테스트 2건 추가. 테스트 코드가 utils export를 읽는 방식이라 런타임 의존성은 추가되지 않음 | packages/app-kit/src/logger.test.ts:49,59 (주석 :7 갱신) |
| 20#2 | LOW | fixed | createKeyAuthHook·createKeyPreHandler의 헤더 없음/키 불일치 401 분기와 문구를 `rejectUnauthorized` 헬퍼로 통합 | packages/app-kit/src/auth.ts:19,52,74 |
| 20#3 | LOW | fixed | 위쪽 필드 JSDoc과 바로 아래 `if (!key)` throw를 그대로 재서술하던 줄 삭제. 라이브러리 미종료 한 줄만 유지 | packages/app-kit/src/auth.ts:43 직전 줄 (제거) |
| 20#4 | LOW | fixed | preHandler 호출부의 `timingSafeKeyEqual` 반복 주석 삭제. 타이밍 안전 근거는 파일 상단 JSDoc에 유지 | packages/app-kit/src/auth.ts:74 인접 (제거) |
| 20#5 | LOW | fixed | 프로세스 미종료 설계 설명을 env.ts 한곳에 두고 auth 쪽 주석을 한 줄 참조로 축약 | packages/app-kit/src/auth.ts:43, packages/app-kit/src/env.ts:4-7 (유지) |

## 검증

워크트리에서 실제로 실행한 명령과 결과입니다.

- `yarn install` : 성공 (Done with warnings in 10s 131ms, 패키지 빌드 스텝 경고만)
- `yarn generate` : 성공 (exit 0)
- `yarn typecheck` : 성공 (Tasks: 14 successful, 14 total). 마지막 재실행은 커밋 amend 직후, shardclient 등 4개 태스크 cache miss로 실제 실행 후 통과
- `yarn workspace @sirubot/shardclient test` : 성공 2파일 10테스트 (ws-types 6 + 신규 client.test 4)
- `yarn workspace @sirubot/app-kit test` : 성공 4파일 29테스트. `--reporter=verbose`로 미러 동기화 테스트 2건 실행까지 확인
- `yarn workspace @sirubot/dashboard test` : 성공 40파일 261테스트 (신규 14건: notify 5, storage 6, profile-stats 2, api-handler 미등록 키 1)
- `yarn workspace @sirubot/dashboard lint` : 성공 (exit 0, eslint 출력 없음)
- `yarn workspace @sirubot/shardclient lint` / `yarn workspace @sirubot/app-kit lint` : 성공 (All matched files use Prettier code style)
- `grep -rn $'\u2014' packages/shardclient/src` : 0건 (finding 19#1~3 치환과 이번에 새로 쓴 주석 2건 포함)
- 환경 메모: 최초의 `yarn workspace <pkg> test|lint` 직접 실행은 `command not found: vitest` / `command not found: prettier`로 실패했습니다. 이 워크트리의 Yarn 4.12가 워크스페이스 스크립트 PATH에 해당 워크스페이스 직속 bin만 넣기 때문이고, `PATH="$PWD/node_modules/.bin:$PATH"` 접두를 붙여 동일 스크립트를 재실행해 통과했습니다 (fixes/12-server-apps.md에도 같은 현상이 기록돼 있습니다).

미수행한 검증:

- 루트 일괄 `yarn lint` / `yarn test` (turbo fan-out)는 실행하지 않았습니다.
- `yarn build`(대시보드 next build 포함), 브라우저 실행 검증(R-35 계열), GitHub Actions CI는 실행하지 않았습니다.
- 신규 테스트는 전부 모킹(db, fetch, toast, ShardWebSocket) 기반이라 실제 DB·네트워크 동작은 커버하지 않습니다.

## 리스크/병합 주의

동작이 바뀐 지점입니다.

- **공개 subpath 변경 가능성 (최우선 확인)**: `@sirubot/shardclient/ws-types`의 인터페이스 6종이 `z.infer` 타입 별칭으로 바뀌고 `HeartbeatAckPayload`는 삭제됐습니다. 구조 타입이라 shardmanager의 기존 import(`WsMessage`, `IdentifyPayload`, `HeartbeatPayload`, `ShardStatus`, `ShardStatusPayload`, `ShardStatsPayload`, `WsOp`, `WsMessageSchema`)는 typecheck로 확인했지만, 저장소 밖에서 `HeartbeatAckPayload`만 import하는 코드가 있으면 컴파일 오류가 납니다. `ShardClientError` 삭제(19#9)도 같은 관점에서 외부 소비처가 있으면 영향을 받습니다.
- 09#4: `createGuildApiHandler`의 schema 옵션 13개 라우트가 이제 미등록 필드를 400(`지원하지 않는 필드예요: ...`)으로 거절하고, 객체가 아닌 본문도 400(`잘못된 요청이에요.`)으로 거절합니다. 기존에는 미등록 필드를 통과했습니다. 13개 라우트의 클라이언트 페이로드를 모두 스키마 키와 대조해 일치함을 확인했고, 깨진 JSON 본문의 메시지만 이전(zod 메시지 또는 invalidMessage)에서 `잘못된 요청이에요.`로 바뀝니다.
- 09#5: 전역 SWR 기본 fetcher가 fetch에 `cache: "no-store"`를 붙이고, 실패 시 영문 `Network response was not ok` 대신 ApiError(서버 한국어 메시지 우선, 401/403은 재시도 불가로 표시)를 던집니다.
- 09#1: 소셜 알림의 구독 추가/수정/삭제와 채널 검색·해석 실패가 401이면 자동으로 로그인 페이지로 이동합니다(기존에는 없던 동작). 실패 결과 타입 `SocialActionResult`는 그대로라 components 호출부는 손대지 않았습니다.
- 09#2: 키 미설정 경로의 `postDataApi`·`openDataApiStream`에 기존에 없던 `console.warn`이 추가됩니다(로깅 통일용). 반환값(null)은 그대로입니다.
- 09#6: `ProfileGamesStats`에 선택 필드 2개가 추가되고 `getProfileStats`는 항상 값을 채웁니다. 화면 표시 여부는 app/components 범위 밖이라 미확인입니다.
- 19#4: `HEARTBEAT_ACK` 핸들러가 미등록 상태가 되어 ws의 핸들러 맵에 해당 항목이 더 이상 생기지 않습니다. 동작(수신 시 아무것도 안 함)은 동일합니다.
- 20#2: 401 응답을 만드는 위치가 공용 헬퍼 1곳으로 모입니다. 문구와 상태 코드는 기존과 같고 `auth.test.ts` 11건으로 고정돼 있습니다.
- 병합 충돌 가능 지점: `ProfileGamesStats` 필드 추가(09#6)와 전역 fetcher 계약(09#5)은 `app/`·`components/`를 함께 고치는 다른 수정과 맞물릴 수 있으나, 선택 필드 추가와 타입 호환 변경이라 기존 코드는 그대로 컴파일됩니다. `packages/utils`는 읽기만 했고 수정하지 않았습니다.
