TOTAL: 16 (HIGH:5 MEDIUM:4 LOW:7)

# 세그먼트 08: 대시보드 기능 UI 컴포넌트 (apps/dashboard/src/components/{servers,player,playlists,home})

- 감사일: 2026-10-22
- 브랜치: chore/antislop-audit
- 감사 파일 수: 86개 (servers 58, home 16, player 6, playlists 6, 이 중 테스트 파일 7 포함)
- 감사 방식: read-only. 86개 파일 전량 em dash/버즈워드/그라데이션/그림자/글로우/pill/배지/저대비 텍스트/탭 타깃/hover 전용/클리핑/고정 폭/구분선 주석/장식 이모지/TODO/미사용 export/테스트 참조 전수 grep, 핵심 40여 개 파일 전문 열람. R-25 대비는 contrast-check.py로 산출.

## Findings

### 1. [HIGH] 사용자에게 노출되는 문자열 4곳에 em dash 문자가 사용됐다 (R-02)

- 위치: apps/dashboard/src/components/servers/bot-profile-settings.tsx:301 (화면 텍스트), servers/avatar-crop-modal.tsx:272 (aria-label), servers/social/add-subscription-form.tsx:313 (placeholder), servers/custom-command/custom-command-designer.tsx:132 (라벨 텍스트)
- 규칙: R-02 (Hard Gate, em dash 금지)
- 사유: R-02는 사용자에게 보이는 텍스트에서 em dash 문자를 금지한다. 이 4곳은 화면 텍스트, 스크린 리더 라벨, 인풋 placeholder로 직접 노출된다.
- 근거:

```tsx
aria-label="크롭 영역 — 드래그로 위치를 옮기고 방향키도 쓸 수 있어요"
placeholder={`기본: 시루 소셜 알림 — ${resolved?.name ?? "채널 이름"}`}
```

- 제안: 4곳 모두 쉼표 또는 괄호 대체(예: "크롭 영역, 드래그로 ...", "기본: 시루 소셜 알림(채널 이름)")로 교체.

### 2. [HIGH] 플레이리스트 목록 끝 안내 블록의 본문·버튼 대비가 1.73:1로 AA 기준에 미달한다 (R-25)

- 위치: apps/dashboard/src/components/playlists/playlist-detail.tsx:252 (opacity-40 컨테이너), :254 (본문 텍스트), :256 (ghost 버튼)
- 규칙: R-25 (Hard Gate, 본문 4.5:1)
- 사유: `opacity-40` 컨테이너 안에서 text-muted-foreground(#7d686d)를 #ffffff 카드 위에 렌더해 대비가 1.73:1로 본문/대형 모두 FAIL한다. 컨테이너 안의 "곡 추가 버튼을 눌러..." ghost 버튼도 같은 저대비에 노출된다.
- 근거:

```tsx
<div className="... py-12 mt-4 text-center opacity-40 select-none ...">
  <span>더이상 표시할 곡이 없어요</span>
  <Button variant="ghost" size="sm" ...>곡 추가 버튼을 눌러 플레이리스트를 채워보세요!</Button>
```

(contrast-check.py 결과: #cbc3c5 on #ffffff = 1.73:1, normal/large 모두 FAIL)

- 제안: opacity-40 제거 후 muted-foreground 원색(5.16:1)으로 두거나, 안내 문구를 일반 본문 크기·색으로 올리고 버튼만 별도 강조. "더이상"은 "더 이상"으로 띄어쓰기 수정.

### 3. [HIGH] 채팅 유틸 설명 문장 2곳의 텍스트 대비가 3.32:1로 AA 본문 기준에 미달한다 (R-25)

- 위치: apps/dashboard/src/components/servers/chat-tools-settings.tsx:188, :206
- 규칙: R-25 (Hard Gate, 본문 4.5:1)
- 사유: text-sm(14px) 본문에 text-muted-foreground/80을 적용했다. 토큰 #7d686d에 알파 0.8을 곱한 결과색은 #ffffff 카드 위에서 3.32:1로 본문 기준(4.5:1)에 미달한다.
- 근거:

```tsx
<p className="text-sm font-medium text-muted-foreground/80">
  커스텀 이모지만으로 보낸 메시지를 큰 이미지로 다시 보내줘요. ...
```

(contrast-check.py 결과: #978a8a on #ffffff = 3.32:1, normal FAIL / large PASS)

- 제안: /80 알파를 제거한 text-muted-foreground(5.16:1)로 교체. 같은 패널의 다른 설명문도 기본 토큰을 쓰므로 통일된다.

### 4. [HIGH] 터치 타깃이 44px 미만인 컨트롤이 기능 UI에 남아 있다 (R-03)

- 위치: apps/dashboard/src/components/player/web-player-section.tsx:320 (검색어 지우기 h-5 w-5), servers/settings-shared.tsx:340 (저장 바 "변경 사항 저장" h-8), servers/custom-command/custom-command-designer.tsx:141 (강조색 스와치 h-5 w-5), servers/mixer-info.tsx:154 (설명 (i) 버튼 size-6), servers/searchable-select.tsx:180 (선택 해제 X h-3.5 w-3.5), servers/custom-command/custom-command-steps-editor.tsx:132 (이동 버튼 size icon-xs), home/hero-section.tsx:264 (명령어 예시 칩 py-1.5 text-xs)
- 규칙: R-03 (Hard Gate, 44px 탭 타깃)
- 사유: 이 저장소에는 터치 확장 관례가 이미 있다(features-section.tsx:22 `pointer-coarse:min-h-11`, guild-card.tsx:14 주석 "44px(pointer-coarse:min-h-11) 터치 영역", bot-profile-settings.tsx:324). 위 7곳은 그 관례를 적용하지 않아 모바일에서 14~36px 타깃으로 남는다. SaveBar는 모바일에서 하단 고정 바로 노출돼 직접적 영향이 크다.
- 근거:

```tsx
className="absolute right-2.5 top-1/2 inline-flex h-5 w-5 ... focus-visible:ring-2 ..."
className="h-8 px-3.5" ... >{saving || submitting ? "저장 중…" : "변경 사항 저장"}
```

- 제안: 각 컨트롤에 `pointer-coarse:min-h-11 pointer-coarse:min-w-11` 또는 after:inset 확장(ui/badge.tsx:78의 `after:inset-[min(0px,calc((100%-44px)/2))]` 선례)을 적용.

### 5. [HIGH] 플레이리스트 트랙 재정렬이 드래그 전용이라 키보드·터치로 동작하지 않는다 (R-32)

- 위치: apps/dashboard/src/components/playlists/playlist-detail.tsx:175 (draggable 행), :181-186 (그룹 hover로만 보이는 Move 핸들)
- 규칙: R-32 (Hard Gate, 키보드 조작 가능해야 함)
- 사유: 행은 HTML5 drag&drop(onDragStart/onDrop)에만 의존하고, 핸들 아이콘은 `group-hover:block`이라 터치 기기에서 나타나지 않는다. 위/아래 이동 버튼 등 키보드 폴백이 없어 키보드 사용자는 순서를 바꿀 수 없다. 같은 저장소 custom-command-steps-editor.tsx:130-145에는 aria-label이 달린 "위로 이동/아래로 이동" 버튼이라는 올바른 선례가 있다.
- 근거:

```tsx
<div ... draggable onDragStart={(e) => onDragStart(e, idx)} onDrop={(e) => onDrop(e, idx)}>
  <Move size={14} className="... hidden group-hover:block cursor-grab ..." />
```

- 제안: 행마다 위/아래 이동 버튼(또는 포커스 시 키보드 단축키)을 추가하고, 핸들을 hover 없이도 노출되게 변경.

### 6. [MEDIUM] AI 설정과 채팅 유틸의 모드 선택 카드 마크업이 복제돼 있다 (중복, ai-slop-cleaner 체크리스트 3)

- 위치: apps/dashboard/src/components/servers/ai-settings.tsx:36-60 (MODE_CARDS), :192-234 (radiogroup 렌더); servers/chat-tools-settings.tsx:56-104 (동일 구조 MODE_CARDS + ModePicker)
- 규칙: AI 코드 슬롭(컴포넌트 간 복붙)
- 사유: 3열 radiogroup 카드(role="radio", 활성 시 bg-primary/10 ring-2, 우상단 체크 원) 마크업이 라벨·아이콘만 다르고 두 패널에 복제됐다. chat-tools-settings.tsx:55 주석은 "AI 설정 패널과 같은 radiogroup 마크업을 재사용해요"라고 쓰지만 실제로는 import가 아니라 복사다.
- 근거:

```tsx
/** 채널 정책 카드 — AI 설정 패널과 같은 radiogroup 마크업을 재사용해요 */
const MODE_CARDS: Array<{ value: ...; label: string; description: string; icon: React.ReactNode }> = [
```

- 제안: ModePicker/MODE_CARDS 를 servers/settings-shared.tsx 등 공용 모듈로 추출하고 양쪽 패널에서 data만 주입.

### 7. [MEDIUM] 기능 블록 개수를 적은 주석이 실제와 다르다 (주석 슬롭: 사실 오류)

- 위치: apps/dashboard/src/components/home/features-section.tsx:236
- 규칙: antislop-code(주석은 코드가 모르는 사실을 진실되게 담아야 함), R-31
- 사유: 주석은 "기능 블록 7개"라고 적지만 FEATURE_BLOCKS(:60-139)에는 music, playback, chat-tts, chat, custom-commands, greeting, profile, playlist, dashboard 9개가 있다. 틀린 숫자는 주석이 없는 것보다 나쁘다.
- 근거:

```tsx
{/* 기능 블록 7개 — 위아래로 교차(홀수 인덱스는 데모가 왼쪽) */}
{FEATURE_BLOCKS.map((block, index) => (
```

- 제안: "기능 블록 9개"로 수정하거나 숫자를 쓰지 않음.

### 8. [MEDIUM] 한글 안내 문구가 11px(text-2xs)으로 설정된 곳이 있다 (가독성)

- 위치: apps/dashboard/src/components/home/command-list-section.tsx:102, home/features-section.tsx:187, :191, servers/asset-picker.tsx:219, servers/mixer-info.tsx:82
- 규칙: antislop-human(본문 가독성), R-06
- 사유: --text-2xs는 0.6875rem(11px)이다(globals.css:154). 위 항목은 데모 목업이 아닌 제품 본문·라벨에 11px 한글을 쓴다. Discord 목업(discord-command-animation, previews)의 text-2xs는 실제 Discord `-#` subtext 밀도를 재현하는 의도라 제외했다.
- 근거:

```tsx
<p className="text-2xs font-medium text-muted-foreground mt-1">대표 슬래시 커맨드 40개 · 모든 기능 무료</p>
<p className="text-2xs font-medium text-muted-foreground">지원 음원</p>
```

- 제안: 제품 본문 라벨은 text-xs(12px) 이상으로 올리고, 11px은 목업/장식성 요소에만 유지.

### 9. [MEDIUM] 일별 재생 막대 차트의 값이 hover title 속성에만 있어 스크린 리더·터치로 읽을 수 없다 (R-27/R-32)

- 위치: apps/dashboard/src/components/servers/server-stats-tab.tsx:163-176
- 규칙: R-27(상태·데이터가 지각 가능해야 함), antislop-human(형태·색만으로 데이터 전달 금지)
- 사유: 막대마다 accessible 이름이 없고 값(날짜·횟수)은 native title 속성에만 있다. 터치 기기에서는 title 툴팁이 뜨지 않고, 스크린 리더는 막대를 이름 없는 그래픽 요소로 읽는다. 같은 파일의 TopTrackList/RequesterList는 텍스트 목록이라 문제가 없다.
- 근거:

```tsx
<div key={entry.date}
  title={`${formatDate(entry.date)} · ${entry.count}회`}
  className="min-w-[0px] flex-1 origin-bottom rounded-t bg-primary-control/60"
```

- 제안: 각 막대에 `aria-label={...}` 부여 또는 `role="img"` 캔버스 대신 텍스트 대체(요약 문장 또는 스크린리더용 표)를 함께 제공.

### 10. [LOW] 소셜 알림 미리보기 샘플 URL에 밈/가짜 주소가 들어간다 (R-38)

- 위치: apps/dashboard/src/components/servers/social/add-subscription-form.tsx:132 (dQw4w9WgXcQ), :342 (https://example.com); servers/social-alerts-settings.tsx:43 (dQw4w9WgXcQ), :46 (twitch.tv/example), :48 (chzzk.naver.com/live/12345)
- 규칙: R-38 (Real Content or Honest Placeholder)
- 사유: "미리보기" 라벨이 있어 목업으로 이해되지만, 릭롤 URL(dQw4w9WgXcQ)은 실제 영상 주소를 그대로 노출해 장난스러운 인상을 준다. 예약 도메인(example.com)과 존재하지 않는 숫자 ID(/live/12345)는 의도가 드러나는 표시로 바꿀 수 있다.
- 근거:

```ts
sample: { platform: "youtube", ..., title: "새 영상 제목", url: "https://youtu.be/dQw4w9WgXcQ", ... }
```

- 제안: 예약 도메인 표기(예: https://www.youtube.com/channel/실제채널ID 형식의 안내 또는 {url} 자리 표시)로 통일.

### 11. [LOW] 편집기 주석에 박스 드로잉 구분선(──)이 쓰였다 (주석 슬롭: 장식 구분선)

- 위치: apps/dashboard/src/components/servers/member-greeting/greeting-image-editor.tsx:64, :78, :98, :116, :127, :203, :221, :229 (8곳); servers/mixer-info.tsx:35
- 규칙: antislop-code(Decorative Separators)
- 사유: 각 주석은 정보를 담고 있으나 앞뒤 `──` 장식과 끝의 `──`는 구분선 장식만 남긴다. antislop-code는 같은 패턴을 "장식이 곧 메시지"로 보고 plain 한 줄을 권한다.
- 근거:

```ts
// ── 편집 상태 — imageRef는 patchImage가 동기적으로 갱신해요 (히스토리 커밋이 최신값을 읽기 위함) ──
// ── 되돌리기/다시실행 — 조작 단위로 commit()이 호출돼 한 단계씩 쌓여요 ──
```

- 제안: `// 편집 상태: imageRef는 ...` 형태의 일반 주석으로 교체(내용은 유지).

### 12. [LOW] 한국어 주석 전체가 em dash 설명선 관례를 쓴다 (R-02 정합성)

- 위치: 범위 전역, 약 100곳. 대표: servers/server-stats-tab.tsx:35, servers/settings-shared.tsx:60, player/player-live-tab.tsx:33, playlists/playlist-form-modal.tsx:47
- 규칙: R-02 (Hard Gate의 문자 규칙과의 정합성)
- 사유: 사용자 카피가 아닌 코드 주석이라 제품 영향은 없지만, 저장소 전체가 em dash 금지 규칙(R-02)을 주석 관례로만 계속 쓰고 있어 규칙 적용 범위(주석 포함 여부)가 불명확하다. finding 1의 사용자 노출 4곳과 같은 문자를 주석이 양산해 재발을 키운다.
- 근거:

```ts
/** 표시 이름 폴백 — 봇 캐시 조회 실패(탈퇴한 멤버 등)면 사용자 ID 앞 6자리 라벨로 표시해요 */
```

- 제안: 규칙을 "제품 카피 금지, 주석 허용"으로 문서화하거나, 신규 주석부터 콜론/괄호 대체 관례로 전환(기존 것은 대규모 리라이트 대상 아님).

### 13. [LOW] 플레이리스트 사이드바 검색 인풋에 accessible 이름이 없다

- 위치: apps/dashboard/src/components/playlists/playlist-sidebar.tsx:45-51
- 규칙: antislop-human(키보드·스크린 리더), R-32
- 사유: placeholder("검색...")만 있고 label/aria-label이 없다. 관례 있는 searchable-select.tsx:213은 `aria-label="검색"`을 달고 있어 불일치도 있다.
- 근거:

```tsx
<Input type="text" placeholder="검색..." value={searchQuery} onChange={...} className="bg-input/50 py-2 ..." />
```

- 제안: `aria-label="플레이리스트 검색"` 추가.

### 14. [LOW] 사용자 안내 문구에 서버 환경변수명(JTC_EMPTY_GRACE_MS)이 노출된다

- 위치: apps/dashboard/src/components/servers/jtc-settings.tsx:214-216
- 규칙: R-15/R-36(사용자 카피는 사용자 언어로)
- 사유: 서버 운영자가 바꿀 수 없는 내부 env 변수명이 사용자 안내문에 그대로 노출돼 정보성보다 혼란이 크다.
- 근거:

```tsx
<p>비어 있는 임시방은 30초 후 자동으로 삭제돼요. (서버 설정 JTC_EMPTY_GRACE_MS로 조정 가능)</p>
```

- 제안: "서버 설정으로 조정할 수 있어요" 수준으로 완화하고 env 변수명은 개발 문서로 옮김.

### 15. [LOW] 파일 외부에서 쓰이지 않는 export 타입이 있다 (죽은 코드 경계)

- 위치: apps/dashboard/src/components/home/discord-command-animation.tsx:12 (TrackInfo), :19 (SlideConfig)
- 규칙: AI 코드 슬롭(미사용 export)
- 사유: 두 인터페이스는 같은 파일 내부에서만 사용된다. 외부 import는 hero-section의 slideConfigs 값 import뿐(grep 전수 확인).
- 근거:

```ts
export interface TrackInfo { title: string; artist: string; ... }
export interface SlideConfig { command: string; args: string; }
```

- 제안: export 키워드만 제거해 내부 타입으로 좁힘.

### 16. [LOW] 신규 기능 UI 대부분에 테스트가 없다 (테스트 누락)

- 위치: 범위 전체. 테스트 존재: servers/server-switcher.test.tsx, servers/settings-shared.test.tsx, servers/guild-unavailable-panel.test.tsx, servers/social/template-editor.test.tsx, servers/member-greeting/greeting-draw.test.ts, servers/custom-command/custom-command-editor.utils.test.ts, player/player-live-tab.test.tsx (7개)
- 규칙: 테스트 누락(LOW)
- 사유: playlists 6파일, home 15파일, player 나머지(now-playing-card, web-player-section, live-progress-bar), servers 설정 패널 전반(ai/music/jtc/channel/chat-tools/assets/custom-commands/social/member-greeting)에 단위 테스트가 없다. 상태 전환이 많은 SaveBar/PanelError 조합은 settings-shared 테스트로 부분 커버된다.
- 근거: 디렉터리별 *.test.* 파일 카운트 7/86.
- 제안: 우선순위는 순수 로직(live-progress-bar의 interpolatedPositionMs, custom-command steps 편집, social sampleFor)부터.

## 검사했지만 문제 없는 항목

- R-16 버즈워드(원활한/혁신적/Seamless/혁신/ Cutting Edge 등): 범위 전체 grep 0건. 카피가 동작 중심 한국어("재생을 요청했어요.", "다른 검색어로 다시 시도해 주세요")로 작성돼 있다.
- R-17 숫자·통계: hero-section.tsx:225-232의 "72개"는 `실측: 2026-10-09, 톱레벨 Command 23 + 서브커맨드 49` 주석으로 근거가 있고, command-list-section.tsx:102의 "40개"는 실제 나열된 40개 목록과 일치, server-stats-tab의 모든 수치는 API 응답에서 온다. footer(범위 밖이지만 참조)에서 이전에 28K+ 통계를 제거한 흔적도 확인.
- R-15 범용 CTA: "지금 초대하기", "대시보드 시작하기", "첫 명령어 만들기", "변경 사항 저장" 등 동작 specific 문구만 사용.
- R-18 가짜 후기/인물: AI 아바타, 가상 이름 후기 섹션 없음. 목업의 "사용자"/"@사용자"는 Discord 프레임 목업의 명시적 플레이스홀더.
- R-01 그라데이션/기본 블루: 그라데이션은 전부 primary 토큰 알파 조합(예: member-greeting-preview 프리셋, mock-thumbnail 폴백 표면)이거나 기능적 용도(color-picker 채도/명도 그라데이션, invite-ticket mask-image)다. blue-purple 기본 그라데이션 없음. hex 하드코딩은 color-picker 프리셋과 greeting-section 기본 강조색(#ffdaff, 주석에 근거 기재)에 한정.
- R-12/R-13 그림자·글로우: 그림자는 elevation 언어(sm 카드, 2xl 팝오버)로 일관, 전면 발광(glow) 없음. invite-ticket의 drop-shadow 2단은 티켓 모티프 목적 주석이 있다.
- R-09 배지: LIVE/공식/상태/곧 만나요 배지는 실제 상태·라벨이며 dot은 상태(StatusDot, label 동반)에만 쓰인다. 장식용 "AI Powered"류 캡슐 없음.
- R-14/R-05 카드 나열: 홈 기능 섹션은 텍스트/데모 교차 2열 구조(features-section.tsx:150-208), 명령어 섹션은 카드 대신 헤어라인 메뉴판(command-list-section.tsx:128-138)으로 구성 변화가 있다. 균등 카드 그리드+bento 남용 없음.
- R-27 3상태: 플레이어(player-live-tab loading/empty/error + hub 미연결 안내), 검색 결과(web-player-section empty/error notice), 재생목록(playlist-detail loading/no-selection/empty + sidebar 검색 무결과), 통계(server-stats-tab error/skeleton/empty), 에셋(asset-picker loading/error/empty + 재시도), 커스텀 명령어(custom-commands-settings loading/error/empty + 액션)가 모두 구비돼 있고, EmptyState가 원인과 다음 행동을 설명한다.
- R-32 포커스: 범위 내 outline-none은 대부분 `focus-visible:ring-2 focus-visible:ring-ring`으로 교체돼 있고(web-player-section:320, avatar-crop-modal:279, server-feature-sidebar:50 등), 버튼 기본형에 focus-visible ring이 내장된다(ui/button.tsx:11). 모달은 Esc 닫힘(mixer-info:134-141, dialog 기본), 크롭 뷰포트는 방향키 이동 지원(avatar-crop-modal:199-208).
- 모바일 재흐름: 길드 카드는 한 행 리스트로 붕괴(guild-card.tsx:12-14), 서버 대시보드 탭은 가로 스크롤 + 선택 탭 자동 스크롤(server-dashboard.tsx:138-159), 플레이리스트는 lg 미만 전용 select(playlist-select-mobile), 곡 추가 모달은 visualViewport로 모바일 키보드를 피한다(add-track-modal.tsx:48-81), 하단 저장 바는 safe-area와 탭바 높이를 피한다(settings-shared.tsx:330). overflow hidden 클리핑으로 텍스트가 잘리는 곳은 확인하지 못함.
- 챗봇 클로저·헤딩 장식 이모지: "도움이 되셨나요"류 클로저 없음, 헤딩에 이모지 장식 없음. 이모지는 Discord 목업 메시지 본문(실제 봇 전송 문자열 모사)에만 쓰인다.
- 주석 슬롭 기타: TODO/FIXME 0건, ALL CAPS 구분선/단계 내레이션/빈 라벨/엔드 마커/장식 이모지 주석 0건. 대부분의 주석이 왜(constraint·성능·접근성)를 담아 보존 가치가 있다(예: player-live-tab:56 429 지터 근거, avatar-crop-modal:289 마스크 shadow 근거, mixer-info:12 모션 목적 R-19 명시).
