TOTAL: 16 (HIGH:3 MEDIUM:6 LOW:7)

# 세그먼트 07: 대시보드 UI 프리미티브 (apps/dashboard/src/components/{ui,primitives,overlay,layout,navbar,discord,data,motion,licenses})

- 감사일: 2026-10-22
- 브랜치: chore/antislop-audit
- 감사 파일 수: 42개 (소스 37개, 테스트 5개. servers/player/playlists/home 폴더는 범위 밖)
- 감사 방식: read-only. 범위 내 파일 전량 열람 + contrast-check.py 대비 검증(warning/destructive/discord 틴트 배지, ring 토큰, muted 텍스트, avatar offline dot, menu focus accent) + em dash/이모지/구분선/TODO/엔드 마커 grep 전수 sweeps. 빌드·테스트·클릭 검증은 수행하지 않았다(세그먼트 규칙).

## Findings

### 1. [HIGH] 상태 틴트 배지의 12px 텍스트가 라이트 테마에서 AA 4.5:1에 미달한다

- 위치: apps/dashboard/src/components/ui/badge.tsx:16-20 (같은 톤 조합이 primitives/status-dot.tsx:7-10의 exported toneStyles에도 존재)
- 규칙: R-25 (Hard Gate)
- 사유: badge는 text-xs(12px)라 일반 텍스트 기준 4.5:1이 필요한데, contrast-check.py 결과 warning #9a6100 on bg-warning/10 = 4.49:1(흰 배경 위)~4.10:1(surface-2 위), destructive #d4183d on bg-destructive/10 = 4.46~4.47:1, discord #5865F2 on bg-discord-primary/10 = 라이트 3.87~4.04:1, 다크 3.09:1로 모두 FAIL했다. success(4.76:1)와 info(4.85:1)만 PASS라 같은 패턴 안에서도 일부 톤만 깨진다. design-tokens 스킬도 이 틴트 방식의 대비 문제와 솔리드 배지 전환이 미이관 상태임을 기록하고 있다.
- 근거:

```tsx
warning: "bg-warning/10 text-warning",
danger: "bg-destructive/10 text-destructive",
discord: "bg-discord-primary/10 text-discord-primary",
```

- 제안: warning/destructive/discord 배지만 솔리드 배경(또는 대비 검증을 통과한 틴트)으로 전환하고, 전환 시 scripts/wcag-contrast-audit.py로 재확인한다.

### 2. [HIGH] 라이트 테마 포커스 링(ring-ring = #ee6f8b)이 비텍스트 3:1 기준에 미달한다

- 위치: apps/dashboard/src/components/ui/button.tsx:11 (동일 패턴 input.tsx:17, textarea.tsx:14, select.tsx:44, switch.tsx:63, tabs.tsx:56, badge.tsx:9, toast.tsx:64, slider.tsx:81, color-picker.tsx:126,172,208)
- 규칙: R-32, R-34 (Hard Gate)
- 사유: focus-visible:ring-2 focus-visible:ring-ring이 범위 내 대부분의 컨트롤에 쓰이는데, --ring = var(--brand) 라이트값 #ee6f8b는 contrast-check.py 기준 라이트 배경 위 2.61:1(#fff0f0)~2.77:1(#fff9f9)~2.88:1(#ffffff)로 3:1에 못 미친다. 다크는 #f98aa0 기준 6.88~7.73:1로 PASS라 라이트에서만 포커스 인디케이터가 약해지는 R-34 테마 불균형이다.
- 근거:

```tsx
"group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-control border-0 text-sm font-medium whitespace-nowrap transition-control duration-fast outline-none select-none focus-visible:ring-2 focus-visible:ring-ring ...
```

- 제안: 라이트 --ring을 브랜드 핑크 기준 3:1을 넘는 더 어두운 값(예: --primary-text 계열)으로 조정하거나, 링에 어두운 외곽 1px을 더해 대비를 확보한다.

### 3. [HIGH] Avatar offline 상태 점이 40% 불투명도로 거의 보이지 않는다(1.56~1.71:1)

- 위치: apps/dashboard/src/components/ui/avatar.tsx:32
- 규칙: R-25 비텍스트 3:1 (Hard Gate)
- 사유: offline 점은 bg-dot-neutral/40이라 dot-neutral(#7d686d/#b9a4a9)이 40%만 섞인다. contrast-check.py로 합성하면 라이트 배경 위 약 #cbbfc1 = 1.71:1, 다크 배경 위 약 #44373a = 1.56:1로 상태 표시기 최소 3:1에 크게 못 미친다. 점 주위가 border-background 링이라 페이지 배경과 점이 뭉개져, offline 상태는 시각적으로 사실상 제거된다. 상태 자체가 색상으로만 전달되며(aria-label은 영문이라 한국어 UI와도 어긋난다) 저시각 사용자에게 재설정 신호가 사라진다.
- 근거:

```tsx
offline: "bg-dot-neutral/40",
```

- 제안: offline도 최소 3:1을 넘는 불투명도/색으로 올리고, 점을 흰/검은 테두리로 띄워 어떤 배경 위에서도 형태가 읽히게 한다.

### 4. [MEDIUM] 메뉴·셀렉트 항목의 포커스 표시가 1.51:1 배경 전환에만 의존한다

- 위치: apps/dashboard/src/components/ui/select.tsx:120 (동일 패턴 dropdown-menu.tsx:92, command.tsx:159)
- 규칙: R-32 (약한 포커스 인디케이터)
- 사유: 포커스가 outline-hidden + focus:bg-accent로 처리되는데, accent 라이트 #ffc3c9는 흰 popover 위 1.51:1, 다크 #4d3b40는 #2b2023 위 1.51:1로 배경 전환이 매우 약하다. 텍스트 색은 accent-foreground로 바뀌지만 포커스와 선택(data-selected)이 같은 bg-accent를 써서, 키보드 사용자가 현재 항목을 구분하기 어렵다.
- 근거:

```tsx
"relative flex w-full cursor-default items-center gap-1.5 rounded-control py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground ...
```

- 제안: 포커스 링(ring-2 ring-ring 계열)을 명시적으로 추가해 선택 배경과 구분한다.

### 5. [MEDIUM] ChannelSelect/RoleSelect가 목록 null을 로딩·오류와 구분 없이 disabled로만 표시한다

- 위치: apps/dashboard/src/components/discord/channel-select.tsx:88,102 (role-select.tsx:74,88도 동일 구조)
- 규칙: R-27 (empty/loading/error state)
- 사유: `disabled={disabled || channels === null}`뿐이라, 데이터가 아직 안 왔는지 불러오기에 실패했는지 사용자에게 아무 신호가 없다. 선택기가 그냥 비활성화되어 로딩 중 오류로 읽히거나, 오류인데 무반응으로 남는다. 같은 범위의 license-list.tsx:72-77은 EmptyState로 빈 상태를 안내하는 대조 사례다.
- 근거:

```tsx
disabled={disabled || channels === null}
```

- 제안: loading/error/ready를 구분하는 상태 prop을 두어 로딩 스켈레톤과 오류 안내 문구를 각각 렌더하거나, 부모가 그 상태를 처리한다는 계약을 타입과 주석으로 명시한다.

### 6. [MEDIUM] 라이선스 외부 링크의 탭 타깃이 13px 아이콘 크기뿐이다

- 위치: apps/dashboard/src/components/licenses/license-list.tsx:101-104
- 규칙: R-03 (44px 미만 탭 타깃)
- 사유: aria-label은 잘 달려 있으나(p.101) 앵커에 패딩/최소 크기가 없어 터치 영역이 아이콘 13px 수준이다. 모바일에서 외부 저장소 링크를 정확히 누르기 어렵다. 같은 범위의 badge.tsx:78(after:inset으로 44px 히트 에어리어 확장)과 toast.tsx:133(after:-inset-2)은 히트 영역을 확장하는 관례가 이미 있다.
- 근거:

```tsx
className="shrink-0 text-muted-foreground transition-colors duration-fast hover:text-primary-text"
```

- `<ExternalLink size={13} aria-hidden />` 주위를 최소 44px 버튼(또는 after 히트 확장)으로 감싼다.

### 7. [MEDIUM] 한국어 UI에서 11~12px 소형 텍스트가 라벨·설명으로 반복 사용된다

- 위치: apps/dashboard/src/components/navbar/mobile-tab-bar.tsx:340 (text-2xs = 11px 탭 라벨), apps/dashboard/src/components/primitives/field.tsx:45,50 (설명·오류 12px), apps/dashboard/src/components/primitives/status-dot.tsx:50 (상태 라벨 12px)
- 규칙: 감사 기준 2 (한글 본문 14px 미만)
- 사유: 모바일 탭바의 "플레이리스트" 같은 한국어 네비게이션 라벨이 11px이고, 폼 설명/오류 메시지와 상태 라벨이 12px이다. 디자인 시스템이 text-2xs를 마이크로 라벨 대체 토큰으로 허용하고 있긴 하나, 본문 성격의 한국어 텍스트(특히 오류 안내)는 12px 이하에서 가독성이 떨어진다.
- 근거:

```tsx
className={`relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-2xs font-medium transition-colors duration-fast ${
```

- 제안: 탭바 라벨과 오류 메시지는 text-xs(12px) 이상, 이상적으로 본문 기준인 text-sm(14px)으로 올린다.

### 8. [MEDIUM] dark: 유틸리티가 컴포넌트 코드에 직접 남아 토큰 재정의 원칙과 어긋난다

- 위치: apps/dashboard/src/components/ui/button.tsx:30 (dark:bg-input/30 dark:hover:bg-input/50), apps/dashboard/src/components/ui/input-group.tsx:17 (dark:bg-input/30, dark:has-disabled:bg-input/80, dark:has-...:ring-destructive/40), apps/dashboard/src/components/ui/dropdown-menu.tsx:92 (dark:data-[variant=destructive]:focus:bg-destructive/20)
- 규칙: 감사 기준 4 (R-34 테마 체계)
- 사유: 프로젝트 디자인 시스템은 "다크는 CSS 변수 재정의만, 컴포넌트에서 dark: 변형을 새로 만들 필요 없다"고 규정하는데, shadcn 파운데이션 잔재로 세 파일에 dark: 분기가 남아 있다. 진단 예외(상태 색상)에도 해당하지 않는 입력 서피스/포커스 분기라, 토큰을 바꿀 때 이들 규칙이 따라오지 않아 한쪽 테마만 깨질 위험이 있다.
- 근거:

```tsx
"border border-border-strong bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-input/30 dark:hover:bg-input/50",
```

- 제안: 해당 다크 값을 .dark 변수 재정의로 옮기고 컴포넌트의 dark: 분기를 제거한다.

### 9. [MEDIUM] Field의 필수 표시(*)가 aria-hidden이고 렌더 프롭이 required를 넘기지 않는다

- 위치: apps/dashboard/src/components/primitives/field.tsx:37-41 (타입 field.tsx:6-10)
- 규칙: 감사 기준 2 (색상/장식만으로 상태 전달, 접근성)
- 사유: 필수 표시가 빨간 별표뿐이고 aria-hidden이라, 스크린 리더 사용자에게는 required 여부가 전달되지 않는다. FieldRenderProps에 required가 없어 렌더 프롭 경로에서는 컨트롤에 aria-required를 연결하기 어렵다. 별표는 색상+기호 신호지만 기호가 AT에는 숨겨져 있어 절반만 작동한다.
- 근거:

```tsx
<span aria-hidden className="ml-1 text-destructive">
	*
</span>
```

- 제안: FieldRenderProps에 required를 추가하고 별표에 "(필수)" 텍스트 대안을 넣거나, 컨트롤로 required를 전달해 aria-required가 걸리게 한다.

### 10. [LOW] CommandDialog의 기본 제목·설명이 영문으로 남아 있다

- 위치: apps/dashboard/src/components/ui/command.tsx:37-38
- 규칙: R-02/R-16 인접 (한국어 UI 기본 문구)
- 사유: 현재 유일한 소비자(global-command-palette.tsx:90)가 한국어 제목·설명을 넘겨 실제 화면에는 안 나오지만, 기본값이 "Command Palette"/"Search for a command to run..."이라 다른 곳에서 쓰면 영문이 노출된다. sr-only 안내라 접근성 텍스트이기도 해 한국어 기본값이 자연스럽다.
- 근거:

```tsx
title = "Command Palette",
description = "Search for a command to run...",
```

- 제안: 기본값을 한국어("명령 팔레트", "실행할 명령을 검색해요.")로 바꾼다.

### 11. [LOW] MockThumbnail이 영문 워터마크와 cn() 없는 템플릿 문자열 클래스를 쓴다

- 위치: apps/dashboard/src/components/primitives/mock-thumbnail.tsx:6,9
- 규칙: 감사 기준 6 (중복 스타일/컨벤션)
- 사유: "No Image"가 한국어 UI에서 영문으로 노출된다. 또한 className을 템플릿 리터럴로 이어 붙여 범위 내 다른 컴포넌트의 cn() 관례와 다르다(충돌 클래스 병합이 안 된다). 그라데이션 자체는 썸네일 부재 표면이라는 목적이 주석에 적혀 있어(R-01 목적 통과) 문구와 클래스 작성 방식만 문제다.
- 근거:

```tsx
<div className={`flex flex-col items-center justify-center bg-gradient-to-br from-primary/20 via-primary/5 to-secondary/20 relative ${className}`}>
```

- 제안: "이미지 없음" 등 한국어 문구로 바꾸고 cn()으로 클래스를 병합한다.

### 12. [LOW] PageHeader가 cn() 대신 템플릿 리터럴로 className을 합성한다

- 위치: apps/dashboard/src/components/layout/page-header.tsx:21
- 규칙: 감사 기준 6 (중복 스타일/컨벤션)
- 사유: `className={\`...\${className}\`}` 방식이라 호출자가 충돌 클래스를 넘길 때 tailwind-merge가 작동하지 않는다. 범위 내 나머지 컴포넌트는 모두 cn()을 쓴다.
- 근거:

```tsx
<header className={`mb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-4 sm:gap-6 pb-6 relative ${className}`}>
```

- 제안: cn(...)으로 교체한다.

### 13. [LOW] Button과 Badge에 의미 없이 중복된 variant 별칭이 있다

- 위치: apps/dashboard/src/components/ui/button.tsx:15-16 (default == primary), button.tsx:22,28 (danger == destructive), apps/dashboard/src/components/ui/badge.tsx:17-18 (danger == destructive, dotVariants 43-44도 중복)
- 규칙: 감사 기준 6 (죽은 코드/중복 스타일)
- 사유: 두 이름이 같은 클래스 문자열을 가리켜, 어느 쪽이 정식 이름인지와 둘 중 하나를 쓰지 않게 할 규칙이 사라진다. 새 variant 추가 시 두 곳을 같이 고쳐야 하는 유지 비용도 생긴다.
- 근거:

```tsx
default: "bg-primary text-primary-foreground hover:bg-primary/70",
primary: "bg-primary text-primary-foreground hover:bg-primary/70",
```

- 제안: 정식 이름 하나만 남기거나(호출부 마이그레이션), 별칭이 의도라면 각 주석으로 계약을 남긴다.

### 14. [LOW] Skeleton이 pulseBase 상수를 두고도 같은 클래스 문자열을 다시 쓴다

- 위치: apps/dashboard/src/components/primitives/skeleton.tsx:20,56
- 규칙: 감사 기준 6 (중복 스타일)
- 사유: `const pulseBase = "animate-pulse rounded-md bg-muted"`를 정의해 놓고 Skeleton 컴포넌트는 같은 문자열을 인라인으로 다시 적어, 한쪽만 바꾸면 스켈레톤 스타일이 갈라진다.
- 근거:

```tsx
return <div data-slot="skeleton" className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
```

- 제안: `cn(pulseBase, className)`으로 통일한다.

### 15. [LOW] ChannelSelect와 RoleSelect가 선택값 유지 로직과 셀렉트 배선을 복제한다

- 위치: apps/dashboard/src/components/discord/channel-select.tsx:67-70,94-105 (role-select.tsx:54-57,80-91에 동일 구조)
- 규칙: 감사 기준 6 (중복)
- 사유: keepMissing selectedIds useMemo와 단일/다중 SearchableSelect 분기가 두 파일에 그대로 복제돼 있다. 두 선택기 중 하나에만 수정(예: 이전 Finding 5의 상태 처리)이 들어가면 나머지가 어긋난다.
- 근거:

```tsx
const selectedIds = useMemo(() => {
	if (!keepMissing) return [];
	return props.multiple ? (props.value ?? []) : props.value ? [props.value] : [];
}, [keepMissing, props.multiple, props.value]);
```

- 제안: selectedIds 계산과 단일/다중 렌더 분기를 공용 헬퍼로 뽑는다.

### 16. [LOW] 범위 내 42개 파일 중 테스트가 5개 파일에만 있다

- 위치: apps/dashboard/src/components/ui/color-picker.tsx 전체 (테스트 없음. 반면 slider.test.tsx, toast.test.tsx, navbar/mobile-tab-bar.test.tsx, navbar/tab-bar-math.test.ts, discord/discord-options.test.ts는 존재)
- 규칙: 감사 기준 6 (테스트 누락, LOW)
- 사유: color-picker는 키보드 한 스텝/드래그 커밋/HEX 정규화/무채색 유지 같은 회귀 지점이 많은데 테스트가 없다. badge dismiss, field의 describedBy/invalid 배선, empty-state 문자열 action 분기도 마찬가지다. 기존 테스트들은 계약(히트 영역, 키보드 커밋, 구조 트립와이어)을 잘 고정하고 있어 같은 방식을 이어갈 여지가 있다.
- 근거:

```ts
// @vitest-environment happy-dom
import { act } from "react";
```

- 제안: color-picker 키보드/커밋 계약과 Field의 aria 배선부터 회귀 테스트를 추가한다.

## 검사했지만 문제 없는 항목

- R-01 그라데이션: 범위 내 하드코딩 파랑-보라 그라데이션 없음. 그라데이션은 color-picker HSV 편집 표면(목적이 주석에 명시, color-picker.tsx:28)과 mock-thumbnail 부재 표시(목적 명시, mock-thumbnail.tsx:3)뿐이며 모두 토큰/기능 기반이다. COLOR_PRESETS 하드코딩 hex는 사용자 색 데이터라는 주석이 있어 패키지 위반이 아니다(color-picker.tsx:8).
- R-09 배지: "New/Beta" 식 장식 pill 없음. Badge 변형은 모두 상태(勝/경고/오류/정보/Discord)용이며 license-list의 개수 배지도 실제 데이터다. Eyebrow pill(H1 위 라벨 pill) 없음(page-header.tsx).
- R-13 glow: 범위 내 glow/shadow-glow 없음.
- R-04 이모지: 범위 내 장식 이모지 grep 0건. 아이콘은 모두 기능적(lucide, 실제 채널 종류/트렌드 방향/상태 표시).
- R-11 반경: rounded-control/menu/card/dialog 역할 토큰이 일관되게 쓰인다. capsule은 배지·스위치·탭 알약·슬라이더 thumb 등 기능적 요소뿐이라 "전부 pill"이 아니다.
- R-12 그림자: shadow-sm(카드)/2xl(오버레이) 등 elevation 사다리 안에 있고, card.tsx:7-8에 보더리스+elevation 근거가 남아 있다(보존할 주석).
- R-05 그리드: 범위 내 bento/균등 3~4열 그리드 없음(페이지 구성은 세그먼트 05 범위).
- R-24/R-26 죽은 링크·컨트롤: navLinks 5개 모두 실제 라우트이며 미로그인 시 로그인 콜백으로 바뀐다(links.ts:17-21). 명령 팔레트 항목도 전부 router.push를 수행한다. 동작 없는 버튼·폼 없음.
- R-32 키보드: Base UI 프리미티브로 Escape/포커스 위임이 제공되고, color-picker는 role=slider + 방향키(67-86행), 배지 dismiss는 44px 히트 확장(after:inset, badge.tsx:78), 토스트 닫기도 after:-inset-2(toast.tsx:133)로 터치 영역을 확보한다. dialog/sheet 닫기 버튼과 sr-only "닫기"도 있다.
- 모바일 긍정 사례: 모바일 탭바는 min-h-12(48px) 타깃 + safe-area 패딩(313행) + pointer 드래그에 click guard, reduced-motion이면 duration 0 즉시 스냅(107,202행). color-picker 프리셋/색상 바는 pointer-coarse에서 44px로 커진다(170,208행). dialog는 max-w-[calc(100%-2rem)]로 폭 재진다. 100vh 섹션·고정 px 폭·overflow hidden 클리핑 없음.
- R-27 부분 준수: EmptyState 프리미티브가 제목/설명/액션을 갖고 license-list 빈 검색 결과에 쓰인다(72-77행). SkeletonCard는 role="status" + "로딩 중" 라벨을 가진다(skeleton.tsx:33-34). Finding 5의 선택기만 예외.
- R-19 모션: status-dot는 안정 상태(READY/IDLE)를 정적으로 그리고 연결 중·오류만 펄스로 한정하는 근거 주석이 있다(status-dot.tsx:42). reveal은 whileInView + once라 무한 루프가 없고 framer 모션은 전역 MotionConfig reducedMotion="user"를 받는다. 장식 상태 dot 남용 없음.
- R-17/R-36 날조 데이터: stat-card는 호출자 값만 렌더하고 라이선스 수치는 커밋된 JSON 기반이다. 날조 통계·후기 없음.
- 대비 PASS 확인(contrast-check.py): muted 텍스트 #7d686d는 라이트 4.66~5.16:1, #b9a4a9는 다크 5.65~6.71:1로 AA PASS. 배지 default의 text-foreground/80 합성(#615659 on #fff0f0)도 6.36:1 PASS. 다크 상태 배지(warning #fbbf24 = 7.58:1, destructive #ff7b8a = 5.42:1)도 PASS라 Finding 1은 라이트 틴트와 discord 고정색에 한정된다.
- 주석 슬롭: 구분선/단계 내레이션/빈 라벨/모호 TODO/엔드 마커/장식 이모지 grep 0건. dialog.tsx:33(blur 렉 방지), switch.tsx:17-36(트랙 지오메트리), tabs.tsx:57(Base UI data-active 매칭 함정), toast.tsx:12-15(단일 매니저 계약) 등은 왜를 설명하는 보존 대상이다.
- em dash(R-02) 관련 사실 기록: 범위 내 em dash 55건은 전부 코드 주석·테스트 이름이며 사용자에게 보이는 UI 문자열에는 0건이다. R-02가 다루는 대상은 에이전트가 작성하는 UI 카피이고, antislop-copywriting의 지침대로 단독 em dash는 사람 문체의 일환일 수 있어 주석의 하드코딩 금지로 확대하지 않았다. 다만 새로 쓰는 UI 카피에는 적용하지 않아야 한다.
- R-30 클론: Discord 스타일 요소(채널/역할 선택, discord 토큰)는 제품 도메인이 Discord 봇 대시보드라 의도된 정체성이다.
- 미검증 항목(정직한 한계): read-only 세그먼트 규칙상 빌드·실행·클릭 검증과 실제 라이트/다크 전환 및 브레이크포인트 육안 확인은 수행하지 않았다(R-35 미수행). Finding 2의 링 대비와 Finding 1의 배지 대비는 contrast-check.py 수치 기준이며, 런타임 렌더 배경에 따라 ±0.1 수준 변동이 있을 수 있다.
