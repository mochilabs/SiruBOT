---
name: design-tokens
description: >
  SiruBOT 대시보드 디자인 토큰(컬러/타이포/간격/반경/다크모드) 규칙. 신규 화면·컴포넌트에 스타일을
  새로 정의할 때, 또는 Tailwind v4 @theme/CSS 변수 구조를 확인해야 할 때 사용. 하드코딩 색상 금지.
---

# Design Tokens Skill

## Overview

`apps/dashboard/src/app/globals.css` 하나가 디자인 시스템의 단일 소스다. Tailwind **v4**
(`@import "tailwindcss"`, `@theme`, `@utility`, `@custom-variant`) 기반이며, 다크/라이트는 CSS 변수 재정의로 전환된다.
새 코드는 **반드시 토큰 유틸리티**(`bg-primary`, `text-muted-foreground`, `border-border` …)만 사용한다.

- 소스: `apps/dashboard/src/app/globals.css`
- 적용 예시: `apps/dashboard/src/app/components_gallery/page.tsx`
- 폰트: Pretendard Variable (`next/font/local` → `--font-pretendard`), `apps/dashboard/src/app/layout.tsx`

## 1. 컬러 토큰

`:root`(라이트) / `.dark`(다크)에 정의, `@theme`에서 Tailwind 유틸리티로 노출.

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

### 상태 색상 관례 (토큰 아님 — 일관된 사용처 한정)

Tailwind 기본 색을 **투명도와 함께** 쓴다. 새 색상 팔레트를 만들지 말 것.

- 성공/온라인: `emerald-500` (`bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400`)
- 경고/idle: `amber-500`
- 오류/위험/dnd: `red-500` 또는 `rose-500`
- 정보/connecting: `sky-500`

## 2. 반경 · 갼격

- `--radius: 1rem` → `--radius-lg/md/sm`이 여기서 파생 (`rounded-lg` = 1rem, `rounded-md` = 0.875rem, `rounded-sm` = 0.75rem)
- 실제 컴포넌트는 `rounded-xl`(0.75rem), `rounded-2xl`(1rem), `rounded-full`을 자주 쓴다.
- 간격은 Tailwind 기본 스케일만 사용. 커스텀 간격 토큰 없음.
- 컨테이너 폭 고정값: `mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8` (`src/components/container.tsx`)

## 3. 타이포그래피

- 본문: Pretendard (`body`에 자동 적용), 한글 UI 전용.
- 타이틀: `font-black tracking-tighter` + 그라데이션 `text-title-gradient`
  (`PageHeader`의 `text-4xl sm:text-5xl ... truncate`)
- 섹션 라벨/캡션: `text-xs font-black uppercase tracking-widest text-muted-foreground/40` (또는 `/60`)
- 숫자 강조: `font-black tabular-nums text-primary`
- 설명 텍스트: `text-sm font-medium text-muted-foreground/80`

## 4. 유틸리티 (`@utility` — 클래스 그대로 사용)

| 클래스 | 동작 |
| --- | --- |
| `glass-panel` | 카드 60% 불투명 + blur(20px) + `--glass-border` + radius |
| `glass-overlay` | 얇은 오버레이(버튼/뱃지용), blur(12px) |
| `text-title-gradient` | primary→secondary→`#ffb3d9`→primary 300% 그라데이션 텍스트 |
| `animate-shimmer-sweep` / `animate-float-subtle` / `animate-page-in` / `animate-pulse-soft` | 애니메이션 |

- `animate-page-in`: 페이지 전환 (`src/components/page-transition.tsx`)
- 스크롤바: 전역 핑크 얇은 스크롤바 (`@layer base`에 정의, 손대지 말 것)
- 테마 전환: View Transitions API (`::view-transition-old/new(root)`) — `navbar.tsx`의 `toggleTheme`이 `document.startViewTransition` 사용.

## 5. 다크모드 규칙

- `@custom-variant dark (&:is(.dark *))` + `next-themes` `attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}` (`src/components/Providers.tsx`)
- 다크는 **CSS 변수 재정의만**(`.dark { ... }`). 컴포넌트에서 `dark:` 변형을 새로 만들 필요가 없다.
- 진단 예외: 상태 색상(`text-emerald-600 dark:text-emerald-400`)은 토큰이 아니므로 `dark:`를 쓴다.

## 이렇게 쓰세요

```tsx
<div className="glass-panel p-6 hover:border-primary/40">
	<h2 className="text-2xl font-black tracking-tighter text-title-gradient">{title}</h2>
	<p className="text-sm font-medium text-muted-foreground/80">{description}</p>
	<span className="text-xs font-black uppercase tracking-widest text-muted-foreground/40">섹션</span>
</div>
```

```tsx
<Badge variant="success" dot>온라인</Badge>   {/* emerald 토큰 사용 */}
<div className="bg-primary/10 border border-primary/20 text-primary"> ... </div>  {/* primary 변형 관례 */}
```

## 이렇게 하지 마세요 (금지)

```tsx
// ✗ 하드코딩 hex / rgb / 임의 팔레트
<div style={{ backgroundColor: "#ff85c1" }} />
<div className="bg-[#ff85c1] text-[#2d1b1e]" />
<div className="bg-pink-400" />          // 브랜드 핑크는 bg-primary

// ✗ 새 CSS 변수를 @theme 매핑 없이 컴포넌트에 직접 사용
<span style={{ color: "var(--my-new-color)" }} />

// ✗ 라이트/다크를 각각 다른 클래스로 분기
<div className="bg-white dark:bg-[#1a0e12]" />   // → bg-background

// ✗ 상태를 색상만으로 표현 (배지/닷과 텍스트 병행)
<span className="text-emerald-500">정상</span>   // → <StatusDot status="ready" label="정상" />
```

- 예외적으로 하드코딩이 허용되는 곳: Discord 브랜드색(`#5865F2`), `EmbedPreview`의 `embed.color`(사용자 입력),
  아바타/역할 색상(`roleColorHex` 같은 Discord 원본 색상).

## 주의: 상충 문서

`apps/dashboard/DESIGN.md`는 "glassmorphism 금지, 불투명 서피스, 16px 이상" 이라는 **개편 노트**이며,
현재 실제 코드(`globals.css`, primitives)와 일치하지 않는다. **현행 코드가 기준**이다.
DESIGN.md의 방향성(불투명 패널·틴티드 글로우)은 신규 대시보드 면밀한 화면에서 참고만 하고,
기존 화면과 섞일 때는 `glass-panel`을 따른다.
