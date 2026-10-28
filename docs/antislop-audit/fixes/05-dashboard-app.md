FIXED: 29 / DEFERRED: 0 / N/A: 0

# antislop 감사 수정 리포트: 05 대시보드 페이지 + 06 대시보드 API

- 날짜: 2026-10-23
- 워크트리/브랜치: /home/seonu/.local/share/opencode/worktree/e08104/fix-dashboard-app (fix/dashboard-app)
- 커밋: 512046c6 (push 없음)
- 수정 범위: `apps/dashboard/src/app/**` (페이지 + API 라우트). `components/`, `lib/`, `hooks/`는 소유 에이전트 영역이라 수정하지 않음.
- 신규 파일: `app/_components/focus-page-shell.tsx`, `app/api/_shared/validation.ts`, `app/contributors/loading.tsx`, `app/player/[id]/loading.tsx`, `app/api/tracks/search-query.ts`, `app/api/tracks/search-query.test.ts`, `app/api/playlists/[id]/tracks/clean-title.ts`, `app/api/playlists/[id]/tracks/clean-title.test.ts`

## Finding별 수정

| 세그먼트#번호 | 등급 | 상태 | 변경 요약 | 파일:라인 |
|---|---|---|---|---|
| 05#1 | HIGH | fixed | 형제 라우트 Loader 관례대로 loading.tsx 2곳 추가(sr-only role=status 안내 포함) | `apps/dashboard/src/app/contributors/loading.tsx:1`, `apps/dashboard/src/app/player/[id]/loading.tsx:1` |
| 05#2 | HIGH | fixed | 워터마크 글자(1.09:1)를 aria-hidden 붙은 CSS blur 배경 요소로 교체 | `apps/dashboard/src/app/error/page.tsx:29-32` |
| 05#3 | HIGH | fixed | `h-[100svh]` 고정 높이를 형제와 동일한 `min-h-[calc(100svh-var(--navbar-h))]` 재흐름으로 교체 | `apps/dashboard/src/app/invite/page.tsx:29`, `apps/dashboard/src/app/_components/focus-page-shell.tsx:10` |
| 05#4 | HIGH | fixed | 로그아웃 인라인 버튼에 터치 전용 `pointer-coarse:inline-flex min-h-11 items-center px-2` 적용 | `apps/dashboard/src/app/servers/page.tsx:54` |
| 05#5 | MEDIUM | fixed | 툴팁 없는 통계 박스 2곳의 `cursor-help`, `group`, `relative` 제거 | `apps/dashboard/src/app/track/page.tsx:69`, `apps/dashboard/src/app/track/page.tsx:80` |
| 05#6 | MEDIUM | fixed | 낙하 버튼의 `aria-hidden`/`tabIndex={-1}` 제거 + aria-label 부여로 키보드 조작 경로 확보 | `apps/dashboard/src/app/not-found.tsx:64`, `apps/dashboard/src/app/not-found.tsx:91` |
| 05#7 | MEDIUM | fixed | main 래퍼와 블러 오브가 동일한 4곳을 FocusPageShell로 통합, R-01 근거 주석은 셸 한 곳에 수렴 | `apps/dashboard/src/app/_components/focus-page-shell.tsx:9-16` (사용: invite/redirect, login, invite, not-found) |
| 05#8 | MEDIUM | fixed | globals.css 등호 구분선 배너 10곳을 평문 한 줄로 교체(설명이 있는 주석 본문은 보존) | `apps/dashboard/src/app/globals.css:1` (배너 10곳, 1~489행) |
| 05#9 | MEDIUM | fixed | Primitives 목차의 Zap 아이콘을 섹션 의미에 맞는 Component로 교체 | `apps/dashboard/src/app/design/page.tsx:22` |
| 05#10 | MEDIUM | fixed | 섹션 제목 `whitespace-nowrap` 제거로 좁은 폭 줄바꿈 허용 | `apps/dashboard/src/app/shards/page.tsx:71` |
| 05#11 | LOW | fixed | 죽은 컨트롤에 실제 상태 연결: dismissible 배지(사라짐+되돌리기), 고정 슬라이더 2개(state), 드롭다운 3항목(선택 피드백 표시) | `apps/dashboard/src/app/design/_sections/primitives-section.tsx:149`, `apps/dashboard/src/app/design/_sections/primitives-section.tsx:248`, `apps/dashboard/src/app/design/_sections/overlay-section.tsx:135`, `apps/dashboard/src/app/design/_sections/overlay-section.tsx:158` |
| 05#12 | LOW | fixed | 최상급 카피를 실제 기능(신청·대기열·웹 플레이어) 설명으로 교체 | `apps/dashboard/src/app/invite/page.tsx:50` |
| 05#13 | LOW | fixed | 완료 상태 🎉 이모지를 Check 아이콘으로 교체 | `apps/dashboard/src/app/not-found.tsx:111` |
| 05#14 | LOW | fixed | 카운트 칩 `w-[200px]`를 `min-w-[200px]`로 바꿔 내용 기준 폭이 되게 함 | `apps/dashboard/src/app/invite/page.tsx:41` |
| 05#15 | LOW | fixed | 코드를 다시 말하는 JSX 주석(`Success Symbol`, `배경 블러` 2곳) 제거. 블러 주석의 R-01 근거는 셸 주석으로 통합 | `apps/dashboard/src/app/invite/redirect/page.tsx:13`, `apps/dashboard/src/app/_components/focus-page-shell.tsx:5` |
| 05#16 | LOW | fixed | Foundation 본문 영문 문장을 페이지 언어(한국어)로 교체, 코드 경로는 code 태그로 유지 | `apps/dashboard/src/app/design/_sections/foundation-section.tsx:13-15` |
| 05#17 | LOW | fixed | 빈 문자열 `className=""` 속성 제거 | `apps/dashboard/src/app/shards/page.tsx:77-82` |
| 05#18 | LOW | fixed | 읽지 않는 `tocRefs`와 콜백 ref 할당 제거 | `apps/dashboard/src/app/design/page.tsx:56-59` |
| 05#19 | LOW | fixed | 게임 전적 빈 상태 "-"를 원인과 다음 행동이 담긴 한 줄로 교체 | `apps/dashboard/src/app/profile/profile-view.tsx:169-171` |
| 06#1 | MEDIUM | fixed | data-api 실패 폴백 조립 14곳을 테스트 있는 `dataApiFailResponse(result, FALLBACK)` 호출로 교체(11파일) | `apps/dashboard/src/app/api/servers/[id]/channels/route.ts:33` 외 subscriptions:34·54, [subId]:49·79·106, roles:27, youtube:28, twitch:31, chzzk profile:28, chzzk search:42, playlists/search:19, draft:37, refine:52 |
| 06#2 | MEDIUM | fixed | 아바타/배너 중복 검증 블록을 `toImageDataUri` 로컬 헬퍼로 통합, 메시지 용량을 `MAX_AVATAR_BYTES`에서 유도 | `apps/dashboard/src/app/api/servers/[id]/bot-profile/route.ts:13-27`, `apps/dashboard/src/app/api/servers/[id]/bot-profile/route.ts:82` |
| 06#3 | LOW | fixed | 500 응답 영문 메시지 6파일을 "~해요" 한국어 안내로 통일(console.error 영문 로그는 유지) | `apps/dashboard/src/app/api/tracks/route.ts:80`, `apps/dashboard/src/app/api/shards/route.ts:15·20`, `apps/dashboard/src/app/api/voice-servers/route.ts:15·19`, `apps/dashboard/src/app/api/data-api/route.ts:16·21`, `apps/dashboard/src/app/api/voice-servers/history/route.ts:24·28`, `apps/dashboard/src/app/api/servers/route.ts:74` |
| 06#4 | LOW | fixed | noembed 실패 폴백을 "제목 없음"/"아티스트 없음"으로 교체 | `apps/dashboard/src/app/api/playlists/[id]/tracks/route.ts:94-95` |
| 06#5 | LOW | fixed | reorder의 재서술 주석 3줄과 번호 내레이션 삭제, -1 제약과 시프트 범위 예시 주석은 보존 | `apps/dashboard/src/app/api/playlists/[id]/reorder/route.ts:81-109` |
| 06#6 | LOW | fixed | 플레이리스트 트랙 라우트의 라인별 재서술 주석 5줄 삭제, 순서 제약 주석(32행)은 유지 | `apps/dashboard/src/app/api/playlists/[id]/tracks/route.ts:94` 일대(메타데이터·upsert·max position·create·delete 위치) |
| 06#7 | LOW | fixed | stats의 "safe" 파싱 인라인 주석 삭제(JSDoc 10-14행에 단일화) | `apps/dashboard/src/app/api/servers/[id]/stats/route.ts:92` |
| 06#8 | LOW | fixed | 플레이리스트 name/description 스키마와 검색어 스키마를 공용 모듈로 합치고 4라우트가 import | `apps/dashboard/src/app/api/_shared/validation.ts:1-30` (사용: `playlists/route.ts:4`, `playlists/[id]/route.ts:4`, `playlists/search/route.ts:2`, `servers/[id]/player/search/route.ts:4`) |
| 06#9 | LOW | fixed | 순수 함수 2개를 모듈로 분리하고 vitest 추가(라우트 모듈 import가 next-auth 체인을 끌어와 라우트 직접 테스트가 불가함을 확인 후 분리 경로 채택) | `apps/dashboard/src/app/api/tracks/search-query.ts:1` + `search-query.test.ts:1`, `apps/dashboard/src/app/api/playlists/[id]/tracks/clean-title.ts:1` + `clean-title.test.ts:1` |
| 06#10 | LOW | fixed | import 쉼표 뒤 공백 누락 3곳 정리 | `apps/dashboard/src/app/api/tracks/route.ts:6`, `apps/dashboard/src/app/api/servers/[id]/greeting/route.ts:3`, `apps/dashboard/src/app/api/servers/[id]/social/subscriptions/route.ts:7` |

## 검증

실제 실행한 명령과 결과만 기재.

- `yarn install` (워크트리, background) -> 성공. 출력: "Done with warnings in 10s 288ms".
- `yarn workspace @sirubot/dashboard lint` (eslint 9.39.5) -> exit 0, 무출력(성공). 실측 소요 7.8초. 마지막 편집 이후 재실행도 exit 0.
- `yarn workspace @sirubot/dashboard typecheck` -> exit 0. 게이트 유효성 점검: `src/app/__typecheck_probe.ts`에 의도적 타입 오류를 넣으면 exit 2와 `error TS2322`를 출력하고, probe 제거 후 다시 exit 0.
- `yarn turbo test --filter=@sirubot/dashboard --force` -> Tasks 3 successful / 3 total, 0 cached. 같은 명령의 상세 출력: `Test Files 39 passed (39)`, `Tests 252 passed (252)`. 신규 테스트 2개 포함(search-query 3개, clean-title 2개).
- 신규 테스트 단독 실행(직접 `vitest run` + PATH 지정) -> `Test Files 2 passed`, `Tests 5 passed`.
- `yarn workspace @sirubot/dashboard test` -> 실패: `command not found: vitest`. 원인은 vitest가 루트 package.json에만 있는 의존성이라 이 환경의 yarn 스크립트 PATH 주입에서 검색되지 않음. 동일 스위트를 turbo 경유로 실행해 통과.
- `yarn workspace @sirubot/dashboard build` -> 첫 실행은 Next.js 보안 업그레이드 권고(SecurityFatalError)로 중단, 재실행 후 exit 0. 신규 파일이 라우트로 오인되지 않음을 라우트 목록(`/contributors` 정적, `/player/[id]` 동적 등)으로 확인.
- `contrast-check.py` 실행 결과 -> 기존 워터마크 라이트 합성 1.09:1 FAIL, 다크 합성 1.13:1 FAIL. 글자 불투명도 상향 후보(#a3999b)는 배경 대비 2.66:1인 상태에서도 본문 muted(#7d686d)가 그 위에서 1.86:1 FAIL(같은 본문이 페이지 배경 위에서는 4.95:1 PASS). 따라서 글자 경로는 본문 대비를 깨뜨려 채택하지 않고, 대안이었던 CSS 배경 요소 경로를 채택.
- 브라우저 런타임 검증(실제 렌더링, 탭/클릭, 대비 육안 확인) -> 미수행.

## 리스크/병합 주의

동작이 바뀐 지점(라인 단위).

- `error` 페이지의 거대 "ERROR" 글자 워터마크가 같은 자리를 지나가는 blur 배경 요소로 대체됨: 화면에 보이던 단어 텍스트가 사라지고 질량만 남음(기존 대비는 육안 불가 수준).
- `not-found` 낙하 버튼 6개가 키보드 탭 순서에 진입하고 스크린리더에 "떠 있는 아이콘 N 떨어뜨리기"로 읽힘(기존 `aria-hidden` 제거). 본문 뒤 아이콘 레이어도 a11y 트리에 노출됨.
- data-api 실패 응답이 헬퍼 계약으로 통일됨: 빈 메시지 4xx는 기존 502가 upstream 4xx로, 5xx(메시지 있는 경우)는 502로 바뀌고 메시지는 그대로 유지. `custom-commands/draft`·`refine`·`playlists/search`는 기존 상태 passthrough에서 이 계약으로 이동(예: data-api 503 응답이 이제 502로 내려감).
- `contributors`·`player/[id]` 라우트에 로딩 화면이 신규로 노출됨(기존에는 서버 렌더 대기 동안 안내 없음).
- 노출 문구 변경: invite 최상급 카피, foundation 영문 본문, 프로필 게임 빈 상태, 6개 API 파일의 500 영문 메시지, 곡 메타폴백(제목/아티스트), 디자인 갤러리 선택 피드백.
- 디자인 갤러리 컨트롤이 실제 상태를 변경함: dismissible 배지는 사라지고 되돌리기 버튼이 뜸, 쿨다운/기본 볼륨 슬라이더 값이 드롭다운/메뉴 항목 선택 결과가 문구로 표시됨. TOC의 Primitives 아이콘이 Component로 교체됨.
- `shards` 제목이 좁은 폭에서 두 줄로 줄바꿈될 수 있음, invite 칩은 200px 하한의 가변 폭, 404 완료 표시가 🎉에서 Check 아이콘으로 교체됨.
- `invite` 페이지의 블러 오브 컨테이너에 `pointer-events-none`이 추가됨(형제와 동일). 기존 오브는 포인터 이벤트를 막지 않았으나 뒤에 있어 실제 동작 차이는 없음.
- 병합 주의: 신규 경로 `app/_components/`, `app/api/_shared/`는 이번 세그먼트에서만 생성. 다른 세그먼트 에이전트가 같은 라우트 파일을 수정하면 충돌 가능성 있음(특히 invite·not-found·playlists 계열).
- 참고(권고 전달): 빌드 과정에서 Next.js 보안 취약점 업그레이드 권고가 표시됨. `next upgrade` 명령은 이번 수정 범위 밖이라 실행하지 않음.
