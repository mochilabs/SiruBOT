# SiruBOT Dashboard — Design System

Single source of truth for the dashboard's visual foundation. The stylesheet
`src/app/globals.css` is normative; this document explains how to read and
extend it, and what must happen in later phases.

Status: **Phase 1 (tokens), Phase 2 (core primitives), Phase 3A (opaque
surface migration), Phase 3B (navigation / interaction primitives) and
Phase 3C (contrast/affordance hardening) complete.** Pages kept their
layout and behaviour; surface/border/elevation/radius expressions and the
primary palette were corrected to pass WCAG 2.1 while keeping the brand
identity. `.glass-panel` and `.glass-overlay` are gone; `.text-title-gradient`
survives on brand hero headlines only. `layout/navigation.tsx` is gone —
in-page tab panels use `Tabs`.

---

## 1. Where things live

| Concern | File |
| --- | --- |
| Tokens, theme mappings, utilities | `src/app/globals.css` |
| shadcn/ui config | `components.json` |
| `cn()` class combiner | `src/lib/utils.ts` |
| Font (Pretendard) + root layout | `src/app/layout.tsx` |
| Theme provider (`next-themes`) | `src/components/Providers.tsx` |
| Reusable primitives | `src/components/primitives/*` |
| Primitive showcase | `src/app/design/page.tsx` |

### Dependencies added (Phase 1)

| Package | Why |
| --- | --- |
| `clsx`, `tailwind-merge` | Implementation of `cn()` in `src/lib/utils.ts` |
| `class-variance-authority` | Variant API used by shadcn/ui components and `primitives/*` |
| `tw-animate-css` | `animate-in/out`, `enter/exit` keyframes required by shadcn/ui components |
| `shadcn` | Provides the `shadcn/tailwind.css` import (`data-*` variants, `no-scrollbar`, scroll utilities) |

No class-merging package (`cn` npm package) is installed — `cn()` is ours.

---

## 2. `globals.css` structure

The stylesheet is divided into nine numbered sections. Keep them in this order.

1. **Tailwind & shadcn/ui integration** — `@import "tailwindcss"`,
   `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`, `@custom-variant dark`.
2. **Light & dark semantic theme variables** — `:root` and `.dark` blocks with
   the shadcn-compatible semantic palette plus Discord preview tokens.
3. **Tailwind theme mappings** — `@theme inline { --color-*: var(...) }`.
4. **Typography tokens** — `--font-sans`, `--text-2xs`.
5. **Radius & surface tokens** — `--radius*`, `--r-*`, `--surface-*`.
6. **Border & shadow tokens** — `--border-subtle/strong`, `--elev-1..5`,
   `--control-boundary` / `--shadow-control-boundary`.
7. **Status colors** — `--success/warning/info` (+ `-foreground`), `--destructive`.
8. **Component-independent utilities** — `@utility` definitions, `@layer base`
   scrollbar, retained legacy utilities, keyframes.
9. **Motion tokens & accessibility** — `--motion-*`, `--ease-*`, view
   transitions, `prefers-reduced-motion` guard.

### `@theme inline`, not `@theme`

`@theme inline` makes every generated utility reference the runtime variable
(`background-color: var(--background)`) instead of freezing a resolved value.
This is required for `.dark` overrides on `<html>` to take effect without a
second generated rule set, and it is what shadcn/ui v4 expects.

Consequence: theme variables are **not** emitted into `:root`. Only the raw
`:root` / `.dark` declarations are. Read them from those blocks.

---

## 3. Token reference

### Semantic color (Pink Beret Music Bot palette — base `#ffdada`)

| Token | Light | Dark | Utility |
| --- | --- | --- | --- |
| `--background` | `#fff9f9` | `#1f1618` | `bg-background` |
| `--foreground` | `#3a2c30` | `#fbeeee` | `text-foreground` |
| `--card` / `--card-foreground` | `#ffffff` / `#3a2c30` | `#2b2023` / `#fbeeee` | `bg-card` |
| `--popover` / `--popover-foreground` | `#ffffff` / `#3a2c30` | `#2b2023` / `#fbeeee` | `bg-popover` |
| `--primary` / `--primary-foreground` | `#ffdada` / `#4f1c2a` | `#ffdada` / `#3a1a22` | `bg-primary text-primary-foreground` |
| `--brand` | `#ee6f8b` | `#f98aa0` | 액션·포커스 링 포인트 핑크 (`bg-brand`) |
| `--primary-control` / `--primary-control-text` / `--primary-control-hover` | `var(--brand)` / `var(--primary-foreground)` / `#f27c96` | `var(--brand)` / `var(--primary-foreground)` / `#f27890` | solid on-state/CTA fills |
| `--primary-text` | `var(--accent-foreground)` (`#4f1c2a`) | `var(--accent-foreground)` (`#ffdada`) | accent text on neutral surfaces |
| `--secondary` / `--secondary-foreground` | `#fff0f0` / `#3a2c30` | `#3a2c30` / `#fbeeee` | `bg-secondary` |
| `--muted` / `--muted-foreground` | `#fff0f0` / `#7d686d` | `#3a2c30` / `#b9a4a9` | `bg-muted`, `text-muted-foreground` |
| `--accent` / `--accent-foreground` | `#ffc3c9` / `#4f1c2a` | `#4d3b40` / `#ffdada` | `bg-accent` |
| `--border` / `--input` | `#f3d3d6` / `#f3d3d6` | `#4d3b40` / `#4d3b40` | `border-border`, `border-input` |
| `--border-subtle` / `--border-strong` | `#f8e1e4` / `#b4779b` | `#3a2c30` / `#a37d89` | `border-border-subtle`, `border-border-strong` |
| `--ring` | `var(--brand)` (`#ee6f8b`) | `var(--brand)` (`#f98aa0`) | `ring-ring` |
| `--primary-rgb` | `255 218 218` | same | space triplet for `rgba(var(--primary-rgb) / …)` |

### Surfaces (opaque, replaces glass for new work)

| Token | Light | Dark | Utility |
| --- | --- | --- | --- |
| `--surface-1` | `#ffffff` | `#2b2023` | `bg-surface-1` — base panel |
| `--surface-2` | `#fff0f0` | `#3a2c30` | `bg-surface-2` — nested / inset area |
| `--surface-3` | `#ffffff` | `#3a2c30` | `bg-surface-3` — floating overlay |

Or use the `panel` utility for the common case (opaque fill + `--r-card`).

### Radius

`--radius: 1rem` is the base. `rounded-sm / md / lg` keep their exact previous
formulas, so existing markup is visually unchanged. `rounded-xl / 2xl / 3xl`
are untouched Tailwind defaults.

Role tokens (new, for new code):

| Token | Value | Utility |
| --- | --- | --- |
| `--r-control` | `0.625rem` | `rounded-control` — buttons, inputs, selects |
| `--r-menu` | `0.75rem` | `rounded-menu` — dropdowns, popovers |
| `--r-card` | `1rem` | `rounded-card` — cards, panels |
| `--r-dialog` | `1rem` | `rounded-dialog` — modals, sheets |

Do not introduce new `rounded-xl/2xl/3xl` usages; pick a role token instead.

### Control boundaries

Neutral and outline controls use an **inset 1px boundary** rather than a
visible fill to satisfy SC 1.4.11 without losing the light neutral surface.

| Token | Value | Utility |
| --- | --- | --- |
| `--control-boundary` | `inset 0 0 0 1px var(--border-strong)` | mapped to `shadow-control-boundary` |
| `--control-boundary-invalid` | `inset 0 0 0 1px var(--destructive)` | mapped to `shadow-control-boundary-invalid` |

Light/dark resolve `--border-strong` to the theme-appropriate rose-grey.

### Shadows

Five intentional elevation steps replace Tailwind's defaults:

| Utility | Token | Use |
| --- | --- | --- |
| `shadow-xs`, `shadow-sm` | `--elev-1` | hairline separation |
| `shadow-md` | `--elev-2` | resting cards |
| `shadow-lg` | `--elev-3` | raised cards, headers |
| `shadow-xl` | `--elev-4` | menus, popovers |
| `shadow-2xl` | `--elev-5` | modals, drawers |

Shadows express elevation only — never decoration.

### Status colors

| Token | Light | Dark |
| --- | --- | --- |
| `--success` / `-foreground` | `#0f7a52` / `#ffffff` | `#34d399` / `#052e16` |
| `--warning` / `-foreground` | `#9a6100` / `#ffffff` | `#fbbf24` / `#451a03` |
| `--info` / `-foreground` | `#0b6bb0` / `#ffffff` | `#38bdf8` / `#082f49` |
| `--destructive` / `-foreground` | `#d4183d` / `#ffffff` | `#ff7b8a` / `#2b1018` |

Utilities: `bg-success`, `text-warning`, `bg-destructive`, … `Badge`,
`StatusDot` and `StatusBadge` were migrated to these tokens in Phase 2; any
remaining `emerald-500/10`-style colours belong to untouched components.

### Typography

- `--font-sans` → `var(--font-pretendard)`. `font-sans` and Tailwind's default
  font family now resolve to Pretendard everywhere.
- `--text-2xs` = `0.6875rem` / `1rem` line-height → `text-2xs`. Replaces the
  `text-[11px]` arbitrary value (identical size) — done in Phase 3B.
  `text-[10px]` has **no** matching token (2xs is 11px), so those 11 dense
  micro-labels were left alone rather than silently grown.

### Motion

| Token | Value | Interface |
| --- | --- | --- |
| `--motion-fast` | `200ms` | `duration-fast` |
| `--motion-base` | `300ms` | `duration-base`, `animate-page-in` |
| `--motion-slow` | `500ms` | `duration-slow` |
| `--ease-out-expo` | `cubic-bezier(.16,1,.3,1)` | `ease-standard` |

MOTION 다이얼: **2** (스크롤 리빌 + 전환). 기록된 사유 기반 예외:
`animate-marquee`(슬래시 커맨드 문화 제시 identity motif, hover 일시정지 있음), `BackgroundShapes`(배경 identity
모티프 — 도형 3개로 제한, `hidden md:block`, reduced-motion 시 정지). 두 장식은 R-19 사유가 코드 주석과 이 문서에
기록되어 있으므로 허용되며, 새 무한 루프 장식을 추가하려면 같은 방식으로 사유를 기록해야 한다.

`duration-200/300/500/700` still work (numeric scale untouched); new code
should use the named durations so timings stay tokenised.

Accessibility: a `prefers-reduced-motion: reduce` block zeroes animation and
transition durations globally. `MotionConfig reducedMotion="user"` handles
framer-motion separately.

---

## 4. Contrast rules

All text must meet WCAG 2.1 AA:

- Normal text: 4.5:1 minimum.
- Large text (18px+): 3:1 minimum.
- Control boundaries (non-text): 3:1 minimum (SC 1.4.11).

Primary palette decisions (Phase 3C — Pink Beret base `#ffdada`):

- `--primary` (`#ffdada`) is the brand **surface**. Default/primary buttons are
  `bg-primary text-primary-foreground` (maroon-on-pink, 10.64:1 light /
  12.06:1 dark). Hover는 `bg-primary/70`.
- `--brand` (`#ee6f8b` light / `#f98aa0` dark) is the 포인트 핑크. It drives
  `--ring` and `--primary-control` (on-state/CTA fills). Labels on it use
  `text-primary-control-text` (= `--primary-foreground`, 4.75:1 light /
  6.79:1 dark). Brand fill vs card (2.88:1 light) is an expected non-text
  fail — 컨트롤은 AA 라벨 텍스트로 식별한다.
- `--primary-text` = `--accent-foreground` (`#4f1c2a` light / `#ffdada`
  dark) is the accent text color for neutral surfaces (13:1+ against both
  backgrounds). `text-primary` (light pink) must never be used for text.
- `--secondary` is a tinted neutral surface. It is too low-contrast against
  cards on its own, so neutral controls pair it with
  `shadow-control-boundary`.
- Status colors keep the previous saturated values — current components use
  `text-success` on `bg-success/10` tints, which pastel palette values would
  break in light mode. A solid-badge status style per the palette preview is
  a separate migration if desired.

Run `python3 scripts/wcag-contrast-audit.py` after any token change. The script
should report `Unexpected failures: 0`.

---

## 5. How to use the tokens

```tsx
// Contents block → Card; simple grouping → surface
<Card padding="lg" className="gap-6">
  <h2 className="text-2xl font-black tracking-tighter text-foreground">{title}</h2>
  <p className="text-sm font-medium text-muted-foreground/80">{description}</p>
</Card>

<div className="rounded-card border border-border-subtle bg-surface-2 p-6"> ... </div>

// Forms, overlays
<input className="rounded-control border-0 bg-input shadow-control-boundary ..." />
<div className="rounded-menu border border-border bg-popover p-1.5 shadow-2xl" />
```

```tsx
<Badge variant="success" dot>온라인</Badge>
<div className="bg-success/10 border border-success/20 text-success">온라인</div>
<div className="bg-primary/10 border border-primary/20 text-primary-text">브랜드 강조</div>
```

## 6. What not to do

```tsx
// ✗ Hard-coded hex / arbitrary palette
<div className="bg-[#ff85c1] text-[#2d1b1e]" />
<div className="bg-pink-400" />

// ✗ Light/dark split in components
<div className="bg-white dark:bg-[#1a0e12]" /> // → bg-background

// ✗ text-primary on a neutral surface
<span className="text-primary">강조</span> // → text-primary-text or text-primary-control
```

- Exceptions: Discord brand (`#5865F2`), `EmbedPreview` embed color (user input),
  avatar/role colors from Discord.

---

## 7. Related documents

- `apps/dashboard/MEMO.md` — past redesign notes; may be stale; code wins.
- Project root `AGENTS.md` — build commands and repo conventions.
