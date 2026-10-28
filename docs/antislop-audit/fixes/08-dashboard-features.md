FIXED: 16 / DEFERRED: 0 / N/A: 0

# 세그먼트 08 fix: 대시보드 기능 UI 컴포넌트

- 수정일: 2026-10-23
- 워크트리: /home/seonu/.local/share/opencode/worktree/e08104/fix-dashboard-features (브랜치 fix/dashboard-features)
- 커밋: ad913be8 (미push)
- 근거 문서: docs/antislop-audit/segments/08-dashboard-components-feature.md Findings 1~16
- 수정 범위: apps/dashboard/src/components/{servers,player,playlists,home}/**. app/, lib/, hooks/, components/{ui,primitives,...}는 수정하지 않았습니다.

## Finding별 처리

| 세그먼트# | 우선순위 | 판정 | 변경 요약 | 파일:라인 |
|---|---|---|---|---|
| 08#1 | HIGH | fixed | 사용자 노출 em dash 4곳 치환. 제안대로 3곳은 쉼표/괄호, 디자이너 라벨 1곳은 같은 R-02 허용 문자인 콜론을 썼습니다 | servers/bot-profile-settings.tsx:301 / servers/avatar-crop-modal.tsx:272 / servers/social/add-subscription-form.tsx:313 / servers/custom-command/custom-command-designer.tsx:132 |
| 08#2 | HIGH | fixed | opacity-40 제거 후 text-muted-foreground 지정, "더이상"을 "더 이상"으로 수정, 대비 근거 주석 추가 | playlists/playlist-detail.tsx:293-301 |
| 08#3 | HIGH | fixed | text-muted-foreground/80 2곳을 text-muted-foreground로 교체 | servers/chat-tools-settings.tsx:145, 164 |
| 08#4 | HIGH | fixed | 탭 타깃 7곳 확대. 저장 버튼/히어로 칩/트랙 이동 버튼은 pointer-coarse:min-h-11, (i) 버튼/스텝 이동 버튼은 pointer-coarse:min-h-11 + min-w-11, 레이아웃을 바꿀 수 없는 인라인 컨트롤 3곳(강조색 스와치, 선택 해제 X, 검색어 지우기)은 badge.tsx 선례의 after:inset 위임 확장 | servers/settings-shared.tsx:394 / home/hero-section.tsx:264 / playlists/playlist-detail.tsx:251, 260 / servers/mixer-info.tsx:154 / servers/custom-command/custom-command-steps-editor.tsx:133, 142 / servers/custom-command/custom-command-designer.tsx:141 / servers/searchable-select.tsx:180 / player/web-player-section.tsx:320 |
| 08#5 | HIGH | fixed | 행마다 aria-label이 있는 위로/아래로 이동 버튼 추가(첫/끝 행 비활성), 드래그 핸들의 hover 노출을 항상 표시로 변경, 재정렬 동작 테스트 추가 | playlists/playlist-detail.tsx:23-27, 67-81, 205-210, 248-265 / playlists/playlist-detail.test.tsx |
| 08#6 | MEDIUM | fixed |복제돼 있던 3열 radiogroup 마크업을 settings-shared의 ModePicker/ModeCardOption로 통합하고 두 패널은 데이터만 주입 | servers/settings-shared.tsx:86-137 / servers/ai-settings.tsx:38, 189-195 / servers/chat-tools-settings.tsx:56, 137-142, 156-161, 175-180 |
| 08#7 | MEDIUM | fixed | 주석의 "기능 블록 7개"를 9개로 수정 (FEATURE_BLOCKS 9개 확인) | home/features-section.tsx:236 |
| 08#8 | MEDIUM | fixed | 지명된 제품 본문 11px(text-2xs) 5곳을 text-xs(12px)로 상향 | home/command-list-section.tsx:102 / home/features-section.tsx:187, 191 / servers/asset-picker.tsx:219 / servers/mixer-info.tsx:82 |
| 08#9 | MEDIUM | fixed | 일별 재생 막대에 role="img"와 aria-label(날짜 + 횟수) 부여, title과의 역할 구분 주석 추가 | servers/server-stats-tab.tsx:163-171 |
| 08#10 | LOW | fixed | 미리보기 샘플 URL을 플랫폼 자리 표시 상수 SAMPLE_URLS로 통일. 감사 위치 5곳과 add-subscription-form의 동일 문자열 1곳(chzzk /live/12345)을 함께 수정 | servers/social/template-editor.tsx:23-28 / servers/social-alerts-settings.tsx:44, 47, 49 / servers/social/add-subscription-form.tsx:106, 132, 342 |
| 08#11 | LOW | fixed | 박스 드로잉 구분선 주석 9곳을 일반 주석으로 치환하고 내용은 그대로 유지 | servers/member-greeting/greeting-image-editor.tsx:64, 78, 98, 116, 127, 203, 221, 229 / servers/mixer-info.tsx:35 |
| 08#12 | LOW | fixed | 이번 수정에서 다시 쓴 주석 9곳과 새로 만든 주석은 콜론/괄호 구분으로 작성. 기존 주석의 em dash는 제안("기존 것은 대규모 리라이트 대상 아님")대로 그대로 두고, 규칙 해석은 제품 카피 금지, 주석 허용으로 본 리포트에 기록 | 예: playlists/playlist-detail.tsx:23, 293 / servers/member-greeting/greeting-image-editor.tsx:64 / servers/mixer-info.tsx:35 |
| 08#13 | LOW | fixed | 플레이리스트 검색 인풋에 aria-label="플레이리스트 검색" 추가 | playlists/playlist-sidebar.tsx:48 |
| 08#14 | LOW | fixed | 사용자 안내문에서 JTC_EMPTY_GRACE_MS 노출 제거, 같은 정보는 코드 주석에 보관 (개발 문서 이전은 이 리포트 외 쓰기가 금지된 문서 범위라 수행하지 않음) | servers/jtc-settings.tsx:213-217 |
| 08#15 | LOW | fixed | 파일 내부 전용 TrackInfo/SlideConfig의 export 키워드 제거. 외부에서 쓰는 slideConfigs는 유지 | home/discord-command-animation.tsx:12, 19 |
| 08#16 | LOW | fixed | 제안의 지명 순수 로직 3곳에 단위 테스트 3파일 6케이스 추가 (interpolatedPositionMs, useListEditor, sampleFor). 지명 범위 외 파일의 커버리지 확대는 비용 때문에 수행하지 않음 | player/live-progress-bar.test.ts / servers/custom-command/use-list-editor.test.tsx / servers/social-alerts-settings.test.ts |

## 검증

실행한 명령과 결과입니다. 실행하지 않은 항목은 아래 "미검증"에 따로 적었습니다.

| 명령 | 결과 |
|---|---|
| `yarn install` (워크트리) | 성공. Done with warnings in 12s 21ms (peer dependency 경고만, 변경 전과 동일) |
| `yarn workspace @sirubot/dashboard lint` (eslint . --max-warnings=0) | 최종 exit 0, 출력 없음. 그전까지 3회 실행 중 2회 실패 후 수정: chat-tools의 미사용 MODE_CARDS 경고, 신규 테스트의 simple-import-sort 정렬 오류 |
| dashboard 테스트 `PATH="$PWD/node_modules/.bin:$PATH" yarn workspace @sirubot/dashboard run test` | Test Files 41 passed (41), Tests 256 passed (256) |
| 신규 테스트 단독 실행 (4회) | live-progress-bar 1파일 3개, playlist-detail 1파일 3개, use-list-editor 1파일 2개, social-alerts-settings + use-list-editor 2파일 3개 모두 통과 |
| `yarn typecheck` (루트 turbo) | Tasks 14 successful / 14 total. dashboard typecheck는 cache miss로 실제 실행 후 통과 |
| `yarn workspace @sirubot/dashboard build` | 2회 실행. 1차는 빌드 후 Next.js 보안 권고(SecurityFatalError)로 exit 1, 같은 명령 재실행은 exit 0 (라우트 테이블까지 생성) |
| 생성 CSS에서 신규 유틸리티 확인 (빌드 산출물 .next/static/chunks/*.css) | `after:inset-y-[min(0px,calc((100%-44px)/2))]`는 `inset-block:min(0px,50% - 22px)`로, `after:inset-x-[min(0px,calc((100%-24px)/2))]`는 `inset-inline:min(0px,50% - 12px)`로, `after:inset-[min(0px,calc((100%-44px)/2))]`는 `inset:min(0px,50% - 22px)`로 생성. 각각 `content:var(--tw-content)` 동반. `@media (pointer:coarse)` 안에 `pointer-coarse:min-h-11{min-height:calc(var(--spacing) * 11)}`(44px)와 `pointer-coarse:min-w-11{min-width:calc(var(--spacing) * 11)}` 생성 확인 |
| scope 밖 파일 변경 여부 | `git diff --stat` 결과 27개 파일 전부 apps/dashboard/src/components/{servers,player,playlists,home} 안. app/, lib/, hooks/ 수정 0건 |

환경 메모: 워크트리에서 `yarn workspace @sirubot/dashboard test`는 `command not found: vitest`가 났습니다 (루트 devDependency 바이너리 PATH 미주입). 위 표의 PATH 주입 방식 또는 루트 `node_modules/.bin/vitest`로 실행했습니다.

### 미검증

- 브라우저에서의 실제 클릭/탭/키보드 조작 확인은 하지 않았습니다. 로그인한 Discord 세션이 필요한 화면이라 실행하지 않았고, 대신 신규 테스트로 이동 버튼의 콜백 순서(onDragStart 후 다음 렌더에서 onDrop), 경계 비활성, hover 노출 제거를 코드 레벨에서 확인했습니다.
- 터치 타깃 실측(44px)은 브라우저에서 측정하지 않았습니다. 생성된 CSS 확인으로 대체했습니다.

### 대비 측정 (contrast-check.py)

| 항목 | before 조합 | before | after 조합 | after | 판정 |
|---|---|---|---|---|---|
| #2 목록 끝 안내 본문 (라이트) | 상속색 foreground #3a2c30의 40% 합성 `#b0abac` on `#ffffff` | 2.27 FAIL | `#7d686d` on `#ffffff` | 5.16 | PASS |
| #2 감사 기재값 재확인 | `#cbc3c5` on `#ffffff` (muted 40% 가정치) | 1.73 FAIL | 위와 동일한 수정 후 색 | 5.16 | PASS |
| #2 ghost 안내 버튼 (라이트) | foreground/75의 40% 합성 `#c4c0c1` on `#ffffff` | 1.80 FAIL | `#6b6164` on `#ffffff` | 5.97 | PASS |
| #3 설명문 2곳 (라이트) | `#978a8a` on `#ffffff` | 3.32 FAIL | `#7d686d` on `#ffffff` | 5.16 | PASS |
| #2/#3 다크 모드 점검 (수정 후 색, 다크 토큰 미변경) | `#b9a4a9` on `#2b2023` | 6.71 | 동일 | 6.71 | PASS |
| #2 ghost 다크 모드 점검 | `#c7bbbb` on `#2b2023` | 8.44 | 동일 | 8.44 | PASS |

참고: 감사 문서의 #2 값 1.73은 muted 토큰에 opacity 40%를 곱한 가정치이고, 실제 렌더 색은 Card가 주는 card-foreground의 40% 합성색이라 2.27입니다. 둘 다 본문 4.5:1 미달이며 수정 후 값은 같습니다.

## 리스크/병합 주의

동작 변경 사항입니다.

- 플레이리스트 행에 위로/아래로 이동 버튼이 생겨 키보드와 터치에서도 재정렬 요청(/api/playlists/:id/reorder)이 일어납니다. 기존은 드래그 전용이었습니다.
- 이동 버튼은 페이지 훅이 내려준 onDragStart/onDrop을 두 렌더에 나눠 호출합니다. handleDragStart/handleDrop이 이벤트의 다른 속성을 읽기 시작하면 dragEventShim(playlist-detail.tsx:25) 갱신이 필요합니다.
- 플레이리스트 행의 Move 핸들이 hover와 무관하게 항상 보입니다. 이 파일의 hover용 group 클래스는 제거했습니다.
- 목록 끝 안내 블록이 opacity-40 대신 muted 텍스트색으로 나와 이전보다 덜 흐립니다. 대비 확보를 위해 의도한 변화입니다.
- 터치 기기에서 저장 버튼, 히어로 예시 칩, 트랙·스텝 이동 버튼, 믹서 (i) 버튼이 44px 높이가 됩니다. 저장 섬 높이가 6px 커지고 예시 칩은 줄바꿈될 수 있습니다.
- 강조색 스와치, 선택 해제 X, 검색어 지우기 버튼은 눈에 보이는 크기가 그대로이고 히트 영역만 24x44(검색어 지우기 44x44)로 넓어집니다. 레이아웃 변화는 없습니다.
- 소셜 알림 미리보기의 {url} 치환 결과가 자리 표시 URL로 바뀝니다. 기존 예시 영상/채널 주소는 제거했습니다.
- AI 설정과 채팅 유틸의 모드 카드 마크업이 settings-shared로 합쳐졌습니다. settings-shared.tsx와 두 패널 파일은 한 번에 병합해야 합니다.
- jtc 안내문, 웹훅 placeholder, 배너 안내, 크롭 aria-label, 디자이너 라벨의 문구가 바뀝니다. 크롭 aria-label은 스크린 리더 출력에도 영향을 줍니다.
- 지명된 라벨 5곳의 글자가 11px에서 12px로 커집니다. 좁은 칸에서 줄바꿈이 생길 수 있습니다.
- 일별 재생 막대와 플레이리스트 검색 인풋에 새 접근성 이름이 붙습니다.
- 신규 테스트 4파일(9케이스)이 CI 테스트에 포함됩니다.
