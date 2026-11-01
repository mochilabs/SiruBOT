---
name: SiruBOT Dashboard
description: 디스코드 음악과 서버 관리를 위한 웹 대시보드. 따뜻한 핑크와 깊이 있는 마룬 아이덴티티.
colors:
  primary: "#ffdada"
  primary-foreground: "#4f1c2a / #3a1a22" # light / dark
  primary-control: "#ee6f8b / #f98aa0"   # light / dark
  primary-control-hover: "#f27c96 / #f27890"
  background: "#fff9f9 / #1f1618"         # light / dark
  foreground: "#3a2c30 / #fbeeee"         # light / dark
  card: "var(--surface-1)"                # #ffffff / #2b2023
  secondary: "var(--surface-2)"           # #fff0f0 / #3a2c30
  muted: "var(--surface-2)"               # #fff0f0 / #3a2c30
  muted-foreground: "#7d686d / #b9a4a9"   # light / dark
  accent: "#ffc3c9 / #4d3b40"             # light / dark
  accent-foreground: "#4f1c2a / #ffdada"  # light / dark
  border: "#f3d3d6 / #4d3b40"             # light / dark
  border-strong: "#b4779b / #a37d89"     # light / dark (3:1 contrast)
  ring: "#c4476a / var(--brand)"          # light / dark
  destructive: "#d4183d / #ff7b8a"       # light / dark
  success: "#0f7a52 / #34d399"           # light / dark
  warning: "#9a6100 / #fbbf24"           # light / dark
  info: "#0b6bb0 / #38bdf8"              # light / dark
typography:
  display:
    fontFamily: "Pretendard Variable, -apple-system, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Pretendard Variable, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Pretendard Variable, -apple-system, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Pretendard Variable, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: "Pretendard Variable, -apple-system, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
rounded:
  control-inner: "0.375rem"
  control: "0.625rem"
  menu: "0.75rem"
  card: "1rem"
  dialog: "1rem"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "36px"
  button-cta:
    backgroundColor: "{colors.primary-control}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "36px"
---

# Design System: SiruBOT Dashboard

## Overview

**Creative North Star: "The Cozy Pink Salon" (따뜻한 핑크 살롱)**

디스코드 음악 봇과 서버 관리 기능을 하나의 아늑하고 정돈된 살롱 공간처럼 경험하게 돕는 대시보드 시스템입니다. 백설기나 팥시루떡처럼 부드럽고 따뜻한 핑크 톤(`--primary`)과 진중한 마룬 텍스트(`--foreground`, `--primary-foreground`)의 대비를 기반으로 설계되었습니다. 차갑거나 기계적인 어드민 콘솔의 느낌을 배제하고, 음향 플레이어와 커뮤니티 설정이 자연스럽게 손에 닿는 감성적인 조작감을 제공합니다.

Operate 모드로서의 정확한 시각 스캔성을 우선시하며, 현란한 그라디언트나 불필요한 장식 테두리 대신 표면(Surface) 레이어링과 섬세한 경계 대비(3:1 non-text contrast)로 기능의 위계를 분명히 합니다.

**Key Characteristics:**
- **Cozy & High-Contrast**: 소프트 핑크 표면과 딥 마룬 텍스트가 이루는 편안하면서도 선명한 가독성 (WCAG AA 기준 준수).
- **Borderless Depth**: 굵은 외곽선 대신 불투명 표면 단계(`--surface-1..3`)와 고해상도 그림자(`--elev-1..5`)로 깊이를 표현.
- **Tactile & Confident**: 인셋 컨트롤 경계(`--control-boundary`)와 빠른 피드백 트랜지션(`transition-control duration-fast`)을 통한 탄탄한 손맛.

---

## Colors

Pink Beret 음악 봇 팔레트(베이스 `#ffdada`)를 중심으로 소프트 핑크 서피스와 포인트 핑크 액션, 딥 마룬 타이포그래피를 조화시킵니다.

### Primary
- **Soft Pink Surface** (`#ffdada`): 브랜드 배경 및 소프트 표면으로 사용. 라이트와 다크 모두 통일된 표면 틴트 역할을 합니다.
- **Brand Action Pink** (`#ee6f8b` / Dark `#f98aa0`): 솔리드 CTA 버튼 채움, 활성 스위치 상태, 포커스 링의 소스.
- **Deep Maroon Foreground** (`#4f1c2a` / Dark `#3a1a22`): 브랜드 핑크 표면 위 텍스트 및 강조 텍스트.

### Neutral
- **Page Background** (`#fff9f9` / Dark `#1f1618`): 페이지 전체 캔버스 배경.
- **Surface 1** (`#ffffff` / Dark `#2b2023`): 기본 카드, 모달, 패널 표면.
- **Surface 2** (`#fff0f0` / Dark `#3a2c30`): 카드 내부 중첩 그룹, 리스트 행, 보조 인셋 컨트롤.
- **Surface 3** (`#ffe6e8` / Dark `#3a2c30`): 플로팅 저장 바, 오버레이 및 호버 승격 표면 (`hover:bg-surface-3`).
- **Body Foreground** (`#3a2c30` / Dark `#fbeeee`): 기본 본문 및 제목 텍스트.
- **Muted Foreground** (`#7d686d` / Dark `#b9a4a9`): 보조 설명, 라벨, 비활성 텍스트.
- **Border Subtle** (`#f8e1e4` / Dark `#3a2c30`): 섹션 구분선 및 정적 분할선.
- **Border Strong** (`#b4779b` / Dark `#a37d89`): 인터랙티브 입력창, 버튼 외곽 경계 (3:1 비텍스트 대비 충족).

### Status
- **Success** (`#0f7a52` / Dark `#34d399`): 성공 상태, 온라인 표시.
- **Warning** (`#9a6100` / Dark `#fbbf24`): 경고 알림 및 미저장 변경 알림.
- **Destructive** (`#d4183d` / Dark `#ff7b8a`): 오류, 삭제 액션, 무효 입력 상태.
- **Info** (`#0b6bb0` / Dark `#38bdf8`): 안내 정보, 봇 링크.

### Named Rules
**The Surface-Driven Contrast Rule.** 컴포넌트 내부에서 임의의 `dark:` 유틸리티를 남발하지 않고, CSS 테마 변수(`globals.css`)의 표면 토큰을 단일 소스로 사용하여 라이트/다크 양쪽에서 최소 4.5:1(본문) / 3:1(비텍스트) 대비를 상시 보장한다.

---

## Typography

**Body/Display Font:** Pretendard Variable (`--font-pretendard`)
**Sub/JP Font:** Pretendard JP Variable (`--font-pretendard-jp`)
**Fallback & Emoji:** Twemoji Mozilla (`/fonts/TwemojiMozilla.ttf`) → Apple Color Emoji / Segoe UI Emoji → 시스템 폰트

**Character:** 깔끔하고 정제된 고딕으로 긴 디스코드 서버/채널 이름과 음악 트랙 메타데이터를 왜곡 없이 선명하게 표시합니다.

### Hierarchy
- **Display** (Bold 700, `2.25rem` / 36px, `line-height: 1.2`): 대시보드 메인 랜딩 헤드라인.
- **Headline** (Bold 700, `1.5rem` / 24px, `line-height: 1.3`): 서버 대시보드 페이지 타이틀 및 주요 모달 제목.
- **Title** (Semibold 600, `1.125rem` / 18px, `line-height: 1.4`): 카드 헤더(`CardTitle`), 섹션 그룹 라벨.
- **Body** (Regular 400 / Medium 500, `0.875rem` / 14px, `line-height: 1.5`): 기본 설명 문구, 테이블 행 텍스트, 폼 컨트롤 본문.
- **Label / Micro** (Medium 500, `0.6875rem` / 11px, `text-2xs`): 배지, 상태 점 설명, 모바일 탭바 라벨. 워터마크나 극소형 메타데이터는 8px(`text-3xs`) 사용.

---

## Layout

- **Container Model**: 상단 네비게이션이 `sticky`이므로 `Container`(`max-w-7xl`, `pt-6 sm:pt-8 pb-16`)를 통해 헤더와의 최소 여백을 항상 유지합니다.
- **Mobile Navigation**: 모바일(`< md`)에서는 하단 플로팅 탭바(`MobileTabBar`)가 활성화되며, 루트 레이아웃에서 safe-area를 고려한 패딩(`pb-[calc(5.25rem+env(safe-area-inset-bottom))]`)을 부여해 컨텐츠 가림을 방지합니다.
- **Sidebar & Scroll**: 서버 설정 사이드바(`ServerFeatureSidebar`)는 `lg:sticky lg:top-20`과 `max-h-[calc(100svh-7rem)] overflow-y-auto`를 적용해 작은 노트북 해상도에서도 스크롤이 끊기지 않습니다.
- **SaveBar Island**: 변경 사항 발생 시 화면 최하단에 플로팅되는 `SaveBar`(`bg-surface-3 rounded-card shadow-2xl`)는 포털로 마운트되며, 바의 실측 높이만큼 폼 하단에 여백을 확보합니다.

---

## Elevation & Depth

토널 레이어링(Tonal Layering)과 부드러운 그림자(Soft Elevation)의 하이브리드 체계를 채택합니다.
표면을 가르는 인위적인 테두리 선 대신, 배경(`--background`) 위에 카드(`--surface-1`), 카드 내부 그룹(`--surface-2`), 플로팅 요소(`--surface-3`)를 얹어 자연스럽게 계층을 형성합니다.

### Shadow Vocabulary
- **Elev-1 (`shadow-sm`)**: 카드 기본 안착 그림자 (`0 1px 2px 0 rgb(0 0 0 / 0.08)` / 다크에서는 불투명도 0.35로 보정).
- **Elev-2 (`shadow-md`)**: 호버된 카드, 서브 드롭다운 메뉴 (`0 2px 6px -2px rgb(0 0 0 / 0.1)`).
- **Elev-3 (`shadow-lg`)**: 컨텍스트 메뉴, 팝오버, 자동완성 리스트 (`0 6px 20px -8px rgb(0 0 0 / 0.16)`).
- **Elev-5 (`shadow-2xl`)**: 모달 대화상자(`Dialog`), 플로팅 저장 바(`SaveBar`) (`0 28px 64px -24px rgb(0 0 0 / 0.35)`).

### Named Rules
**The Borderless Depth Rule.** 카드의 윤곽을 두꺼운 border로 감싸지 않는다. 입체감은 오직 Surface 톤 차이와 Elevation 그림자만으로 나타내며, 외곽선은 인터랙티브 입력 폼의 3:1 경계(`shadow-control-boundary`)에 한해 제한적으로 사용한다.

---

## Shapes

- **Role-Based Radius**: 임의의 `rounded-lg` 대신 목적별 토큰만 사용한다.
  - `--r-control-inner` (`0.375rem` / 6px): 컨트롤 내부 칩, 애드온, 셀렉트 배지.
  - `--r-control` (`0.625rem` / 10px): 버튼, 입력창(`Input`), 셀렉트 트리거.
  - `--r-menu` (`0.75rem` / 12px): 드롭다운, 팝오버 메뉴 아이템.
  - `--r-card` (`1rem` / 16px): 카드 패널, 리스트 컨테이너, 섹션 래퍼.
  - `--r-dialog` (`1rem` / 16px): 모달 창(`Dialog`), 시트(`Sheet`).
  - `rounded-full`: 아바타, 상태 표시 점(`StatusDot`), 단독 칩에만 한정.

---

## Components

### Buttons
- **Shape**: `rounded-control` (10px), `h-9 px-4 text-sm font-medium`.
- **Default/Primary**: `bg-primary text-primary-foreground hover:bg-primary/70` — 부드러운 핑크 채움.
- **CTA**: `bg-primary-control text-primary-control-text font-semibold shadow-sm hover:bg-primary-control-hover` — 주요 저장/진행 액션.
- **Secondary**: `bg-secondary text-secondary-foreground shadow-control-boundary hover:bg-surface-3` — 카드 위 보조 버튼.
- **Destructive**: `bg-destructive/10 text-destructive hover:bg-destructive/15` — 위험 작업.

### Inputs & Fields
- **Style**: `h-9 rounded-control bg-input px-3 py-1 text-sm text-foreground shadow-control-boundary`.
- **Focus**: `focus-visible:ring-2 focus-visible:ring-ring`.
- **Invalid**: `aria-invalid:shadow-control-boundary-invalid aria-invalid:focus-visible:ring-destructive`.

### Cards & Panels
- **Structure**: `rounded-card bg-card text-card-foreground shadow-sm p-5 flex flex-col gap-4`.
- **Muted Variant**: 카드 내부의 2차 구역은 `bg-muted` (`--surface-2`)로 중첩.

### Floating SaveBar
- **Placement**: Portal 기반 화면 하단 중앙 플로팅.
- **Treatment**: `bg-surface-3 rounded-card shadow-2xl px-5 py-3 border-0 flex items-center justify-between`.

### Notice & Callout Boxes (InfoBox / WarningBox)
- **Structure**: `rounded-menu px-4 py-3 text-sm break-words space-y-1`.
- **InfoBox**: `bg-muted/20 text-muted-foreground` — 부드러운 상태 안내.
- **WarningBox**: `border border-warning/30 bg-warning/5 text-warning` — 경고 상태 알림 (`role="alert"`).

---

## Do's and Don'ts

### Do:
- **Do** 컨트롤 요소에 `shadow-control-boundary`를 사용하여 배경과 3:1 이상의 비텍스트 대비를 충족하세요.
- **Do** 색상 또는 표면 토큰을 수정한 후에는 반드시 `python3 scripts/wcag-contrast-audit.py`를 실행하여 `Unexpected failures: 0`을 확인하세요.
- **Do** 전환 효과에 `transition-control duration-fast` (`150ms ~ 200ms`)를 일관되게 사용하세요.
- **Do** 트랙 타이틀은 유효한 URL이 있을 때 새 탭 링크(`<a>`)로 렌더링하세요.
- **Do** 외부 썸네일 이미지(`i.ytimg.com` 등)는 프록시 병목 방지를 위해 `unoptimized` 속성이나 `MockThumbnail` 폴백을 갖춘 `<img>`를 사용하세요.

### Don't:
- **Don't** 카드 좌측에 `border-l-4` 같은 두꺼운 단측 강조선을 두지 마세요 (AI 슬롭 패턴 금지).
- **Don't** 컴포넌트 코드 내부에서 임의의 HEX 색상(`#ffdada`)이나 Tailwind 기본 팔레트(`text-pink-400`)를 인라인으로 하드코딩하지 마세요.
- **Don't** 중립 배경 위에서 `text-primary`를 텍스트 색상으로 직접 쓰지 마세요 (대비 부족, 대신 `text-primary-text` 사용).
- **Don't** 새 코드에 임의의 `rounded-lg/xl`을 사용하지 말고 `--r-*` 토큰을 사용하세요.
