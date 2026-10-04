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

- 소스: `apps/dashboard/src/app/globals.css` — **9개 섹션 번호 구조** (1 통합 / 2 라이트·다크 변수 / 3 `@theme inline` 매핑 /
  4 타이포 / 5 반경·서피스 / 6 보더·섀도 / 7 상태색 / 8 유틸리티 / 9 모션·접근성). 순서를 지킬 것.
- 해설 문서: `apps/dashboard/DESIGN.md` (토큰 표·마이그레이션 규칙 — 코드와 일치함)
- shadcn/ui 펀데이션: `apps/dashboard/components.json` + `src/lib/utils.ts`의 `cn()`
  (`clsx` + `tailwind-merge`). **`cn` npm 패키지는 설치하지 않는다.**
- 적용 예시: `apps/dashboard/src/app/components_gallery/page.tsx`
- 폰트: Pretendard Variable (`next/font/local` → `--font-pretendard`), `apps/dashboard/src/app/layout.tsx`

**`@theme inline`을 쓴다.** 유틸리티가 `var(--background)`를 런타임에 참조하므로 `.dark` 재정의가 그대로 먹히고,
shadcn/ui v4가 기대하는 구조와도 같다. 결과적으로 `--color-*`는 `:root`에 출력되지 않는다 — 원값은 `:root`/`.dark` 블록에 있다.

## 1. 컬러 토큰

`:root`(라이트) / `.dark`(다크)에 정의, `@theme inline`에서 Tailwind 유틸리티로 노출.

Phase 1에서 매핑이 누락되어 있던 `--popover`, `--input`, `--destructive`가 추가되어
`bg-popover`, `border-input`, `bg-destructive`가 이제 사용 가능하다.
새 토큰도 아래와 같이 `:root`/`.dark`에 값 + `@theme inline`에 `--color-*` 매핑을 추가한다.

| 토큰 | 라이트 | 다크 | 용도 |
| --- | --- | --- | --- |
| `--background` | `#fef5f9` | `#1a0e12` | 페이지 배경 → `bg-background` |
| `--foreground` | `#2d1b1e` | `#fce7f3` | 기본 텍스트 → `text-foreground` |
| `--card` / `--card-foreground` | `#ffffff` / `#2d1b1e` | `#2d1b1e` / `#fce7f3` | 카드·패널 → `bg-card` |
| `--primary` | `#ff85c1` (양쪽 동일) | `#ff85c1` | 브랜드 핑크 → `bg-primary`, `text-primary` |
| `--primary-foreground` | `#ffffff` | `#ffffff` | primary 위 텍스트 |
| `--secondary` | `#d4a574` | `#d4a574` | 보조(따뜻한 톤), 그라데이션용 |
| `--muted` / `--muted-foreground` | `#f9eff5` / `#8b6d75` | `#3d2328` / `#c9a8b5` | 비활성·설명 텍스트 |
| `--accent` / `--accent-foreground` | `#ffe4f0` / `#d1608a` | `#4d2a35` / `#ffb3d9` | hover 배경(`bg-accent/50`) |
| `--destructive` | `#d4183d` | `#d4183d` | 삭제·오류 |
| `--border` / `--input` | `#f0d4e3` / `#f9eff5` | `#3d2328` / `#3d2328` | 테두리·입력 배경 |
| `--ring` | `#ff85c1` | `#ff85c1` | focus ring |

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

### 상태 색상 토큰 (Phase 1 신규)

`--success` / `--warning` / `--info` / `--destructive` (+ 각 `-foreground`)가 `:root`/`.dark`에 정의되고
`bg-success`, `text-warning`, `bg-info`, `bg-destructive`로 노출된다. 테마다 색이 갈린다.

기존 배지의 `emerald-500/10` 관례는 아직 유지된다. 해당 컴포넌트를 손댈 때 토큰으로 옮길 것.

### 서피스 토큰 (불투명 — glass 대체)

| 토큰 | 라이트 | 다크 | 용도 |
| --- | --- | --- | --- |
| `--surface-1` | `#ffffff` | `#231317` | 기본 패널 → `bg-surface-1` |
| `--surface-2` | `#f7f1f4` | `#2d1b1e` | 중첩/인셋 영역 → `bg-surface-2` |
| `--surface-3` | `#ffffff` | `#35212a` | 플로팅 오버레이 → `bg-surface-3` |

또는 `panel` 유틸리티(불투명 + `--border` + `--r-card`)로 한 번에 쓴다.

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
  값이 달라지거나 역할이 없으면 바꾸지 않는다 — 이 프로젝트에서 `rounded-xl` 18건·`rounded-2xl`
  11건이 남아 있는 이유다.
- 간격은 Tailwind 기본 스케일만 사용. 커스텀 간격 토큰 없음.
- 컨테이너 폭 고정값: `mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8` (`src/components/container.tsx`)

## 3. 타이포그래피

- 본문: Pretendard. `--font-sans`가 `var(--font-pretendard)`를 가리키므로 `font-sans`와
  Tailwind 기본 폰트 패밀리가 모두 Pretendard다.
- `text-2xs` (`0.6875rem` = **11px** / 라인하이트 `1rem`) — `text-[11px]` 임의값을 대체한다.
  `text-[10px]`(10px)은 값이 다르므로 `text-2xs`로 바꾸지 않는다. 10px는 토큰이 없으므로
  현재도 `text-[10px]`이 남아 있고, 페이지 리디자인 단계에서 결정한다.
- 타이틀: `font-black tracking-tighter` + 그라데이션 `text-title-gradient`
  (`PageHeader`의 `text-4xl sm:text-5xl ... truncate`)
- 섹션 라벨/캡션: `text-xs font-black uppercase tracking-widest text-muted-foreground/40` (또는 `/60`)
- 숫자 강조: `font-black tabular-nums text-primary`
- 설명 텍스트: `text-sm font-medium text-muted-foreground/80`

## 4. 유틸리티 (`@utility` — 클래스 그대로 사용)

| 클래스 | 동작 |
| --- | --- |
| `panel` | **신규** 불투명 서피스 (`bg-surface-1` + `--border` + `--r-card`) |
| `duration-fast` / `duration-base` / `duration-slow` | **신규** 토큰 기반 트랜지션 시간 (`200/300/500ms`) |
| `text-title-gradient` | primary→secondary→`#ffb3d9`→primary 300% 그라데이션 텍스트 |
| `animate-shimmer-sweep` / `animate-page-in` / `animate-pulse-soft` | 애니메이션 |

**Phase 3A에서 `glass-panel`·`glass-overlay`·`--glass-overlay`·`--glass-border`는 삭제됨** (소비자 41/12 → 0/0).
blur/backdrop-filter/반투명 표면은 대시보드 어디에서도 쓰지 않는다.
남은 레거시는 `text-title-gradient` 6파일뿐 (`login`, `invite`, `invite/redirect`, `not-found`, `home/hero-section` ×2) —
브랜딩/헤드라인 전용이므로 그대로 두고, 일반 제목에는 쓰지 않는다.

- `animate-page-in`: 페이지 전환 (`src/components/page-transition.tsx`)
- 스크롤바: 전역 핑크 얇은 스크롤바 (`@layer base`에 정의, 손대지 말 것)
- 테마 전환: View Transitions API (`::view-transition-old/new(root)`) — `navbar.tsx`의 `toggleTheme`이 `document.startViewTransition` 사용.
- 루트 레이아웃의 전역 `InteractiveGlow`는 Phase 1에서 제거됨. 컴포넌트 파일은 남아 있고 `/invite` 계열에서만 사용.

## 5. 토큰: 보더 · 섀도 · 모션

- 보더: `border-border`(기본), `border-border-subtle`(조용한 구분선), `border-border-strong`(입력·강조)
- 섀도: `--elev-1..5` 다섯 단계 → `shadow-xs/sm`(hairline), `shadow-md`(카드), `shadow-lg`(부유 카드),
  `shadow-xl`(메뉴), `shadow-2xl`(모달). **장식이 아니라 높이(elevation)만 표현한다.**
- 모션: `duration-fast`(`200ms`), `duration-base`(`300ms`), `duration-slow`(`500ms`),
  `ease-standard`(`cubic-bezier(.16,1,.3,1)`). **숫자형 `duration-200/300/500`은 금지** —
  Phase 3B에서 대시보드 전체를 이름형으로 옮겼고(28 → 0) 값이 1:1로 같다.
  (`duration-700` 등 토큰에 없는 값은 임의값으로 보고 별도 판단.)
- 접근성: `prefers-reduced-motion: reduce` 블록이 전역 애니메이션/트랜지션을 0으로 만든다.
  framer-motion은 `MotionConfig reducedMotion="user"`로 별도 처리.

## 6. shadcn/ui

- `apps/dashboard/components.json`이 펀데이션 (`style: "base-nova"`, `tailwind.css` = `src/app/globals.css`).
- `cn()`은 `src/lib/utils.ts`의 `clsx` + `tailwind-merge`. **`cn` npm 패키지 금지 (중복 의존성).**
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

// 폼 컨트롤 · 오버레이
<input className="rounded-control border border-border bg-input ..." />
<div className="rounded-menu border border-border bg-popover p-1.5 shadow-2xl" />
```

```tsx
<Badge variant="success" dot>온라인</Badge>   {/* emerald 관례 유지 */}
<div className="bg-success/10 border border-success/20 text-success">온라인</div>   {/* 신규 상태 토큰 */}
<div className="bg-primary/10 border border-primary/20 text-primary"> ... </div>  {/* primary 변형 관례 */}
```

## 이렇게 하지 마세요 (금지)

```tsx
// ✗ 하드코딩 hex / rgb / 임의 팔레트
<div style={{ backgroundColor: "#ff85c1" }} />
<div className="bg-[#ff85c1] text-[#2d1b1e]" />
<div className="bg-pink-400" />          // 브랜드 핑크는 bg-primary

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
- `SOUL.md`의 방향성(불투명 패널·틴티드 글로우·프리미엄 다크)은 Phase 1 `panel`/`--surface-*` 토큰으로,
  불투명 표면 전환은 Phase 3A에서 완료됨.
