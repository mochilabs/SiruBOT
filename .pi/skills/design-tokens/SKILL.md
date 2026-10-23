---
name: design-tokens
description: >
  SiruBOT 대시보드 디자인 토큰(컬러/타이포/간격/반경/다크모드) 규칙. 신규 화면·컴포넌트에 스타일을
  새로 정의할 때, 또는 Tailwind v4 @theme inline/CSS 변수 구조를 확인해야 할 때 사용. 하드코딩 색상 금지.
---

# Design Tokens Skill

## Overview

`apps/dashboard/src/app/globals.css` 하나가 디자인 시스템의 단일 소스다. Tailwind **v4**
(`@import "tailwindcss"`, **`@theme inline`**, `@utility`, `@custom-variant`) 기반이며, 다크/라이트는 CSS 변수 재정의로 전환된다.
새 코드는 **반드시 토큰 유틸리티**(`bg-primary`, `text-muted-foreground`, `border-border` …)만 사용한다.

- 소스: `apps/dashboard/src/app/globals.css` — **9개 섹션 번호 구조** (1 Tailwind & shadcn/ui integration /
  2 Light & dark semantic theme variables / 3 Tailwind theme mappings / 4 Typography / 5 Radius & surface /
  6 Border & shadow / 7 Status colors / 8 Component-independent utilities / 9 Motion & accessibility). 순서를 지킬 것.
- 해설 문서: `apps/dashboard/DESIGN.md` (토큰 표·대비 규칙·컨트롤 경계 — **수치의 기준은 여기와 코드**)
- shadcn/ui 펀데이션: `apps/dashboard/components.json` (`style: "base-nova"`) + `src/lib/utils.ts`의 `cn()`
  (`clsx` + `tailwind-merge`). **`cn` npm 패키지는 설치하지 않는다.**
- 적용 예시: `apps/dashboard/src/app/design/page.tsx` (`/design` 쇼케이스 — 구 `components_gallery`는 삭제됨)
- 폰트: `--font-stack` = Pretendard → **Pretendard JP**(일본어 한자) → **Twemoji Mozilla**(이모지, unicode-range lazy load)
  → 시스템 이모지 → 시스템 폰트. `--font-sans: var(--font-stack)` (`src/app/layout.tsx`의 next/font variables).

**`@theme inline`을 쓴다.** 유틸리티가 `var(--background)`를 런타임에 참조하므로 `.dark` 재정의가 그대로 먹히고,
shadcn/ui v4가 기대하는 구조와도 같다. 결과적으로 `--color-*`는 `:root`에 출력되지 않는다 — 원값은 `:root`/`.dark` 블록에 있다.

## 1. 컬러 토큰

**:root**(라이트) / **.dark**(다크)에 정의, `@theme inline`에서 Tailwind 유틸리티로 노출.
현재 팔레트는 **Pink Beret Music Bot (base `#ffdada`)**.

새 토큰도 아래와 같이 `:root`/`.dark`에 값 + `@theme inline`에 `--color-*` 매핑을 추가한다.

| 토큰 | 라이트 | 다크 | 용도 |
| --- | --- | --- | --- |
| `--background` | `#fff9f9` | `#1f1618` | 페이지 배경 → `bg-background` |
| `--foreground` | `#3a2c30` | `#fbeeee` | 기본 텍스트 → `text-foreground` |
| `--card` / `--card-foreground` | `var(--surface-1)` / `#3a2c30` | `var(--surface-1)` / `#fbeeee` | 카드·패널 → `bg-card` |
| `--primary` / `--primary-foreground` | `#ffdada` / `#4f1c2a` | `#ffdada` / `#3a1a22` | 브랜드 **서피스**(연핑크) → `bg-primary` |
| `--brand` | `#ee6f8b` | `#f98aa0` | 포인트 핑크 원본 — `--ring`·`--primary-control`의 소스(유틸리티 없음, 소비는 `bg-primary-control`) |
| `--primary-control` (+ `-hover`, `-text`) | `var(--brand)` / `#f27c96` / maroon | `var(--brand)` / `#f27890` | **단색 on-state·CTA 채움** (`cta`, `state-toggle` on) |
| `--primary-text` | `#4f1c2a` (accent-foreground) | `#ffdada` | 중립 서피스 위 강조 **텍스트** → `text-primary-text` |
| `--switch-thumb` | `#ffffff` | `#ffffff` | 스위치 thumb 전용(fill) → `bg-switch-thumb` — Switch 컴포넌트 내부에서만 사용 |
| `--secondary` / `--secondary-foreground` | `var(--surface-2)` / `#3a2c30` | `var(--surface-2)` / `#fbeeee` | 틴티드 중립 서피스 |
| `--muted` / `--muted-foreground` | `var(--surface-2)` / `#7d686d` | `var(--surface-2)` / `#b9a4a9` | 비활성·설명 텍스트 |
| `--accent` / `--accent-foreground` | `#ffc3c9` / `#4f1c2a` | `#4d3b40` / `#ffdada` | hover 배경 |
| `--popover` | `var(--surface-1)` | `var(--surface-1)` | 메뉴·팝오버 → `bg-popover` |
| `--border` / `--input` | `#f3d3d6` / `var(--border)` | `#4d3b40` / `var(--border)` | 기본 구분선·입력 배경 |
| `--dot-neutral` | `var(--muted-foreground)` | 동일 | 중립 상태 점·배지 dot 채움 → `bg-dot-neutral` (텍스트 토큰을 fill로 쓰지 않는다) |
| `--rank-1` / `--rank-2` / `--rank-3` | `#b47716` / `#8f8f8f` / `#b0743a` | `#f0b232` / `#b9bbbe` / `#cd7f32` | 랭킹 왕관(금·은·동) → `text-rank-*` |

서피스 슬롯(`--card`·`--popover`·`--secondary`·`--muted`)과 `--input`은 §서피스 토큰의
**별칭**이다 — 같은 값을 두 이름으로 재정의하지 말고 원본(`--surface-*`/`--border`)만 고친다.
| `--ring` | `var(--brand)` | `var(--brand)` | focus ring |

**텍스트/서피스 사용 규칙 (중요)**

- `text-primary`는 **밝은 핑크라 중립 배경에서 읽히지 않는다** — 절대 텍스트에 쓰지 말 것. 강조 텍스트는 `text-primary-text`.
- `--brand`는 액션·on-state 채움의 원본 — 소비는 `bg-primary-control`(`bg-brand` 유틸리티는 폐기됐다). 라벨은 `text-primary-control-text`.
- 중립 컨트롤(`secondary` 계열)은 채움만으로 경계가 안 보이므로 **`shadow-control-boundary`**를 짝지어 쓴다.

### 상태·경계 토큰

| 토큰 | 라이트 | 다크 |
| --- | --- | --- |
| `--destructive` / `-foreground` | `#d4183d` / `#ffffff` | `#ff7b8a` / `#2b1018` |
| `--success` / `-foreground` | `#0f7a52` / `#ffffff` | `#34d399` / `#052e16` |
| `--warning` / `-foreground` | `#9a6100` / `#ffffff` | `#fbbf24` / `#451a03` |
| `--info` / `-foreground` | `#0b6bb0` / `#ffffff` | `#38bdf8` / `#082f49` |
| `--border-subtle` / `--border-strong` | `#f8e1e4` / `#b4779b` | `#3a2c30` / `#a37d89` |

- 상태색은 **라이트에서 채도 높은 값을 유지**한다 — 현재 컴포넌트가 `text-success`를 `bg-success/10` 틴트 위에
  쓰는 방식이 팔레트의 파스텔 값으로는 대비가 무너진다(솔리드 배지 전환은 별도 마이그레이션).
- `border-border-strong`는 컨트롤 비텍스트 경계(SC 1.4.11, 3:1)용. 텍스트에 쓰지 말 것.
- 토큰을 바꾸면 **`python3 scripts/wcag-contrast-audit.py`**를 실행해 `Unexpected failures: 0`을 확인한다.

### Discord 전용 토큰 (`--discord-*` → `text-discord-*` 등)

| 토큰 | 라이트 | 다크 |
| --- | --- | --- |
| `--discord-embed` | `#f2f3f5` | `#2b2d31` |
| `--discord-text` | `#313338` | `#dbdee1` |
| `--discord-text-muted` | `#5c5e66` | `#949ba4` |
| `--discord-btn-active` / `--discord-btn-hover` | `#e3e5e8` / `#d5d6d7` | `#4e5058` / `#6d6f78` |
| `--discord-bg` | `#ebedef` | `#35373c` |
| `--color-discord-primary` | `#5865F2` (고정) | 동일 |
| `--color-discord-blue` / `--color-discord-light` | `#00a8fc` / `#949cf7` | 동일 |

### 서피스 토큰 (불투명 — glass 대체)

| 토큰 | 라이트 | 다크 | 용도 |
| --- | --- | --- | --- |
| `--surface-1` | `#ffffff` | `#2b2023` | 기본 패널 → `bg-surface-1` |
| `--surface-2` | `#fff0f0` | `#3a2c30` | 중첩/인셋 영역 → `bg-surface-2` |
| `--surface-3` | `#ffffff` | `#3a2c30` | 플로팅 오버레이 → `bg-surface-3` · 중립 컨트롤 hover 단계(공식 관례) |

`--surface-3`의 원본 역할은 플로팅 오버레이지만 `bg-secondary → hover:bg-surface-3`
관례(secondary·icon 버튼 hover, 9+ 파일)가 정착해 승격됐다. 장식 아바타 헤일로는
`ring-4 ring-primary/10`(작게는 `ring-2 ring-primary/20`) 관례를 쓴다 — 포커스 링 아님.

## 2. 반경 · 갼격

- `--radius: 1rem` → `--radius-lg/md/sm`이 여기서 파생 (`rounded-lg` = 1rem, `rounded-md` = 0.875rem, `rounded-sm` = 0.75rem)
  — **기존 값 그대로**, 시각 변화 없음. `rounded-xl/2xl/3xl`도 Tailwind 기본값 유지.
- **역할 반경 토큰 (신규 — 새 코드는 이걸 쓴다)**

  | 토큰 | 값 | 유틸리티 | 용도 |
  | --- | --- | --- | --- |
  | `--r-control` | `0.625rem` | `rounded-control` | 버튼·인풋·셀렉트 |
  | `--r-menu` | `0.75rem` | `rounded-menu` | 드롭다운·팝오버 |
  | `--r-card` | `1rem` | `rounded-card` | 카드·패널 |
  | `--r-dialog` | `1rem` | `rounded-dialog` | 모달·시트 |

- 새 코드는 역할 토큰만 쓴다. 기존 `rounded-xl`/`rounded-2xl`은 **역할과 값이 모두 맞을 때만**
  치환한다 (예: `rounded-xl` `0.75rem` = `rounded-menu`, 메뉴/리스트박스 행).
  값이 달라지거나 역할이 없으면 바꾸지 않는다 — 이 프로젝트에서 `rounded-xl` 8건·`rounded-2xl`
  0건이 남아 있는 이유다. `rounded-lg`(1rem) 소비처는 `rounded-card` 등 역할 토큰으로 이전 완료 —
  새 코드에서 `rounded-lg`를 쓰지 않는다.
- 간격은 Tailwind 기본 스케일만 사용. 커스텀 간격 토큰 없음.
- 컨테이너 폭 고정값: `mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8` (`src/components/container.tsx`)

## 3. 타이포그래피

- 본문: `--font-sans`가 `var(--font-stack)`을 가리키므로 `font-sans`는 Pretendard → Pretendard JP → Twemoji → 시스템 순.
- `text-2xs` (`0.6875rem` = **11px** / 라인하이트 `1rem`) — `text-[11px]` 임의값을 대체한다.
  `text-[10px]`(10px)은 값이 다르므로 `text-2xs`로 바꾸지 않는다. `text-3xs`(8px / 0.75rem)는
  썸네일 워터마크 같은 8px 마이크로 라벨 전용 — `text-[8px]` 임의값을 대체한다.
- 페이지 타이틀: `PageHeader`의 `text-4xl sm:text-5xl font-black tracking-tighter text-foreground truncate`
  (그라데이션 없음 — `text-title-gradient` 유틸은 삭제됨).
- 섹션 라벨: **`SectionLabel`(`primitives/section-label`)의 `text-xs font-medium text-muted-foreground`** —
  `font-black` / `uppercase` / `tracking-widest` 금지.
- 숫자 강조: `font-black tabular-nums text-primary-text` (`text-primary`는 밝은 핑크라 텍스트로 못 씀).
- 설명 텍스트: `text-sm font-medium text-muted-foreground/80`

## 4. 유틸리티 (`@utility` — 클래스 그대로 사용)

| 클래스 | 동작 |
| --- | --- |
| `transition-control` | 컨트롤 공통 트랜지션(color / background-color / box-shadow) — button·input·textarea·tag-input이 씀 |
| `duration-fast` / `duration-base` / `duration-slow` | 토큰 기반 트랜지션 시간 (`200/300/500ms`) |
| `animate-page-in` / `animate-pulse-soft` / `animate-marquee` / `scrollbar-none` | 애니메이션·유틸리티 |

**`glass-panel`·`glass-overlay`·`InteractiveGlow`·`panel`·`text-title-gradient`·`animate-shimmer-sweep`는
모두 삭제됐다(소비자 0).**
blur/backdrop-filter/반투명 표면과 그라데이션 타이틀은 대시보드 어디에서도 쓰지 않는다. **유일한 예외**는 dialog/sheet의 모달 백드롭(`bg-black/60 backdrop-blur-sm`)이며, 다른 컴포넌트에는 여전히 금지다. 다시 만들지 말 것.

- `animate-page-in`: 페이지 전환 (`src/components/page-transition.tsx`, `app/template.tsx`)
- `scrollbar-none`: 스크롤바 숨김 — **`custom-scrollbar` 같은 클래스는 `@theme inline`에 정의가 없어 무시된다.**
- 스크롤바: 전역 핑크 얇은 스크롤바 (`@layer base`에 정의, 손대지 말 것)
- 테마 전환: View Transitions API (`::view-transition-old/new(root)`) — `navbar.tsx`의 `toggleTheme`이 `document.startViewTransition` 사용.

## 5. 토큰: 보더 · 섀도 · 모션

- 보더: `border-border`(기본), `border-border-subtle`(조용한 구분선), `border-border-strong`(입력 강조색)
- 컨트롤 경계: **보더리스 원칙** — 입력·버튼은 굵은 border 대신 `shadow-control-boundary`
  (`inset 0 0 0 1px var(--border-strong)`)로 경계를 표현한다. 새 컴포넌트도 이 방식을 따른다.
- 섀도: `--elev-1..3` + `--elev-5` 네 단계 → `shadow-sm`(hairline), `shadow-md`(카드), `shadow-lg`(부유 카드),
  `shadow-2xl`(메뉴·모달). `shadow-xs`·`shadow-xl`·`--elev-4`는 소비자 0으로 삭제됐다.
  **장식이 아니라 높이(elevation)만 표현한다.**
- 모션: `duration-fast`(`200ms`), `duration-base`(`300ms`), `duration-slow`(`500ms`),
  `ease-standard`(`--ease-out-expo`). **숫자형 `duration-200/300/500`은 금지** —
  이름형과 값이 1:1로 같다. (`duration-700` 등 토큰에 없는 값은 임의값으로 보고 별도 판단.)
- 접근성: `prefers-reduced-motion: reduce` 블록이 전역 애니메이션/트랜지션을 0으로 만든다.
  framer-motion은 `MotionConfig reducedMotion="user"`로 별도 처리.

## 6. shadcn/ui

- `apps/dashboard/components.json`이 펀데이션 (`style: "base-nova"`, `tailwind.css` = `src/app/globals.css`).
- 프리미티브는 Radix가 아닌 **`@base-ui/react`** 기반이다. 인터랙션 로직은 `ui/` 컴포넌트에 위임하고,
  **이미 커스텀된 `ui/` 컴포넌트를 스킬스런 className으로 덮어쓰지 말 것** (variant 시스템이 무력화된다).
- `cn()`은 `src/lib/utils.ts`의 `clsx` + `tailwind-merge`(커스텀 토큰 그룹 등록: `shadow-control-boundary`, `rounded-control/menu/card/dialog`, `duration-fast/base/slow`, `text-2xs/3xs`, `transition-control`, `ease-standard`). **`cn` npm 패키지 금지 (중복 의존성).**
- `shadcn add` 후 반드시: `import { cn } from "cn"` → `"@/lib/utils"` 치환,
  Base UI 프리미티브를 쓰면 `@base-ui/react` 수동 설치 (`add`가 자동 설치하지 않음).
- **`shadcn init`은 절대 실행 금지** — `layout.tsx`를 덮어써 Pretendard가 Geist로 바뀐다.

## 7. 다크모드 규칙

- `@custom-variant dark (&:is(.dark *))` + `next-themes` `attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}` (`src/components/Providers.tsx`)
- 다크는 **CSS 변수 재정의만**(`.dark { ... }`). 컴포넌트에서 `dark:` 변형을 새로 만들 필요가 없다.
- 진단 예외: 상태 색상(`text-emerald-600 dark:text-emerald-400`)은 토큰이 아니므로 `dark:`를 쓴다.

## 이렇게 쓰세요

```tsx
// 콘텐츠 블록이면 Card, 단순 묶음이면 서피스
<Card padding="lg" className="gap-6">
	<h2 className="text-2xl font-black tracking-tighter text-foreground">{title}</h2>
	<p className="text-sm font-medium text-muted-foreground/80">{description}</p>
</Card>

<div className="rounded-card border border-border-subtle bg-surface-2 p-6"> ... </div>

// 폼 컨트롤 · 오버레이 — 보더리스: 굵은 border 대신 inset 경계 토큰
<input className="rounded-control border-0 bg-input shadow-control-boundary ..." />
<div className="rounded-menu border border-border bg-popover p-1.5 shadow-2xl" />
```

```tsx
<Badge variant="success" dot>온라인</Badge>   {/* emerald 관례 유지 */}
<div className="bg-success/10 border border-success/20 text-success">온라인</div>   {/* 상태 토큰 틴트 */}
<div className="bg-primary-control/10 border border-primary-control/20 text-primary-text"> ... </div>  {/* 브랜드 강조 관례 */}
```

## 이렇게 하지 마세요 (금지)

```tsx
// ✗ 하드코딩 hex / rgb / 임의 팔레트
<div style={{ backgroundColor: "#ff85c1" }} />
<div className="bg-[#ff85c1] text-[#2d1b1e]" />
<div className="bg-pink-400" />          // 브랜드 핑크 채움은 bg-primary-control · 강조 텍스트는 text-primary-text

// ✗ 새 CSS 변수를 @theme inline 매핑 없이 컴포넌트에 직접 사용
<span style={{ color: "var(--my-new-color)" }} />

// ✗ 라이트/다크를 각각 다른 클래스로 분기
<div className="bg-white dark:bg-[#1a0e12]" />   // → bg-background

// ✗ 상태를 색상만으로 표현 (배지/닷과 텍스트 병행)
<span className="text-emerald-500">정상</span>   // → <StatusDot status="ready" label="정상" />
```

- 예외적으로 하드코딩이 허용되는 곳: Discord 브랜드색(`#5865F2`), `EmbedPreview`의 `embed.color`(사용자 입력),
  아바타/역할 색상(`roleColorHex` 같은 Discord 원본 색상).

## 문서 관계

- `apps/dashboard/DESIGN.md` — 토큰 표·shadcn 규칙·Phase 3 체크리스트. 코드와 일치해야 한다.
- 본 스킬 — 작업 규칙과 금지 사항.
- `apps/dashboard/MEMO.md` — 과거 개편 메모. 현행과 다르면 코드가 기준.
