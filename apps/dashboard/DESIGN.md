# SiruBOT Dashboard — Design System

Single source of truth for the dashboard's visual foundation. The stylesheet
`src/app/globals.css` is normative; this document explains how to read and
extend it, and what must happen in later phases.

Status: **Phase 1 (tokens), Phase 2 (core primitives), Phase 3A (opaque
surface migration) and Phase 3B (navigation / interaction primitives)
complete.** Pages kept their layout and behaviour; only
surface/border/elevation/radius expressions changed. `.glass-panel` and
`.glass-overlay` are gone; `.text-title-gradient` survives on brand hero
headlines only. `layout/navigation.tsx` is gone — in-page tab panels use
`Tabs`.

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
| Primitive showcase | `src/app/components_gallery/page.tsx` |

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
6. **Border & shadow tokens** — `--border-subtle/strong`, `--elev-1..5`.
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

### Semantic color (unchanged values)

| Token | Light | Dark | Utility |
| --- | --- | --- | --- |
| `--background` | `#fef5f9` | `#1a0e12` | `bg-background` |
| `--foreground` | `#2d1b1e` | `#fce7f3` | `text-foreground` |
| `--card` / `--card-foreground` | `#ffffff` / `#2d1b1e` | `#2d1b1e` / `#fce7f3` | `bg-card` |
| `--popover` / `--popover-foreground` | `#ffffff` / `#2d1b1e` | `#2d1b1e` / `#fce7f3` | `bg-popover` |
| `--primary` / `--primary-foreground` | `#ff85c1` / `#ffffff` | same | `bg-primary`, `text-primary` |
| `--secondary` / `--secondary-foreground` | `#d4a574` / `#ffffff` | same | `bg-secondary` |
| `--muted` / `--muted-foreground` | `#f9eff5` / `#8b6d75` | `#3d2328` / `#c9a8b5` | `bg-muted`, `text-muted-foreground` |
| `--accent` / `--accent-foreground` | `#ffe4f0` / `#d1608a` | `#4d2a35` / `#ffb3d9` | `bg-accent` |
| `--border` / `--input` | `#f0d4e3` / `#f9eff5` | `#3d2328` / `#3d2328` | `border-border`, `border-input` |
| `--ring` | `#ff85c1` | same | `ring-ring` |
| `--primary-rgb` | `255 133 193` | same | space triplet for `rgba(var(--primary-rgb) / …)` |

`--destructive`, `--color-popover`, `--color-input` were previously defined but
never mapped into `@theme`, so `bg-destructive`, `bg-popover`, `border-input`
did not exist. They do now.

Text-contrast corrections (2026-10-09 audit):

| Token | Light | Dark | 유틸리티 |
| --- | --- | --- | --- |
| `--muted-foreground` | `#7e5e6a` (was `#8b6d75` — 4.32:1 미달) | `#c9a8b5` (변경 없음) | `text-muted-foreground` |
| `--primary-text` (신설) | `#a3416f` | `#ff85c1` | `text-primary-text` |

규칙:

- `--primary`(#ff85c1)는 배경 전용(버튼/배지/하이라이트). **라이트 모드에서 텍스트·아이콘 색으로 `text-primary`를 쓰면 2.09:1로 AA 미달**이므로 반드시 `text-primary-text`를 쓴다.
- `text-muted-foreground/NN`, `text-foreground/NN` 불투명도 파생은 모두 AA 미달(`/90`조차 라이트 4.3) — **텍스트는 파생 불투명도 없이 풀 토큰**을 쓴다. 경계선: `text-foreground/75` 이상만 예외적으로 허용(실측 6.7+).
- 대비 근거 수치는 각 토큰 주석(globals.css)에 기록.

### Surfaces (opaque, replaces glass for new work)

| Token | Light | Dark | Utility |
| --- | --- | --- | --- |
| `--surface-1` | `#ffffff` | `#231317` | `bg-surface-1` — base panel |
| `--surface-2` | `#f7f1f4` | `#2d1b1e` | `bg-surface-2` — nested / inset area |
| `--surface-3` | `#ffffff` | `#35212a` | `bg-surface-3` — floating overlay |

Or use the `panel` utility for the common case (opaque fill + `--border` +
`--r-card`).

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

### Borders

| Token | Light | Dark | Utility |
| --- | --- | --- | --- |
| `--border` | `#f0d4e3` | `#3d2328` | `border-border` |
| `--border-subtle` | `#f8e6ef` | `#2f1a1f` | `border-border-subtle` — quiet dividers |
| `--border-strong` | `#d9aec6` | `#55323a` | `border-border-strong` — inputs, emphasis |

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
| `--destructive` / `-foreground` | `#d4183d` / `#ffffff` | same |

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

## 4. shadcn/ui

`components.json` is hand-authored (not generated by `shadcn init`, which would
have overwritten `layout.tsx` and replaced Pretendard with Geist):

- `style: "base-nova"` — registry components use Base UI primitives.
- `tailwind.css: "src/app/globals.css"` — already structured the way the CLI expects.
- `aliases.utils: "@/lib/utils"` — points at our `cn()`.

Adding a component:

```bash
yarn workspace @sirubot/dashboard exec shadcn add <name>
```

Lucide 아이콘 선택 사유(R-04 기록): 봇이 Discord Components V2로 렌더하는 것과 톤을 맞추기 위해 컨트롤/상태
아이콘은 stroke 기반 단일 셋(lucide)으로 통일한다. 실제 봇 출력 재현용 이모지(Discord 미리보기)는 제외 — 그것은
데이터다.

Two follow-ups are required, because the registry output does not match this
repo's conventions yet:

1. **Rewrite `import { cn } from "cn"` → `import { cn } from "@/lib/utils"`.**
   The registry hardcodes the `cn` package; we implement `cn` with
   `clsx` + `tailwind-merge` instead, and do not install a second combiner.
2. **Install `@base-ui/react`** if the component imports a Base UI primitive —
   `shadcn add` does not install it.

Never run `shadcn init` in this repo.

---

## 5. Legacy utilities

`glass-panel` and `glass-overlay` were removed from `globals.css` in Phase 3A
after every call site migrated. `--glass-overlay` / `--glass-border` are gone
with them. The only surviving legacy utility is:

| Utility | Consumer files | Decision |
| --- | --- | --- |
| `text-title-gradient` | 6 (`login`, `invite`, `invite/redirect`, `not-found`, `home/hero-section` ×2) | brand/hero headline treatment — kept on purpose |

Do not reintroduce glass. When picking a surface, judge by role:

| Role | Use |
| --- | --- |
| Independent content block | `Card` (`variant` by emphasis) |
| Secondary / inset block | `Card variant="muted"` |
| Simple inner grouping | `bg-surface-2 border border-border-subtle rounded-card` |
| Form control | `bg-input border border-border rounded-control` |
| Menu / popover / toast / notification | `bg-popover border border-border rounded-menu` + `shadow-2xl` |
| Dialog / command palette | `bg-popover border border-border rounded-dialog` + `shadow-2xl` |
| Layout wrapper, nav container, table shell, toolbar | not a Card — a plain surface |

`--secondary`(#d4a574)는 장식(배경 shape 등) 전용 토큰이다. 컨트롤 배경으로 쓰면 white 텍스트 대비 2.23:1로
R-25 위반이 되므로 버튼·배지 용도로 확장하지 않는다.

탭 타깃(R-03): `Button`은 `pointer-coarse:min-h-11`(아이콘 버튼 `pointer-coarse:w-11`)로 터치 기기에서
44px 이상을 보장한다. 데스크탑 fine-pointer 크기(h-8/9/10)는 유지된다.

`panel` is available for a bare `bg-surface-1 + border + rounded-card`, but
prefer a `Card` whenever the element is a real content block.

The global `InteractiveGlow` was removed from the root layout in Phase 1; the
component file remains and is still used by `/invite` and `/invite/redirect`.

---

## 6. Phase 2 primitives

All in `src/components/primitives/`, all built on `cn()` + `cva` + tokens.
Public API is documented in `.opencode/skills/ui-primitives/SKILL.md`.

| Component | File | Notes |
| --- | --- | --- |
| `Button` | `button.tsx` | `cva` variants `primary/secondary/ghost/danger/icon/state-toggle/cta`, sizes `sm/md/lg` (`h-8/h-9/h-10`, `rounded-control`), `loading`, `active`, `icon`, default `type="button"` |
| `Card` + `CardHeader/Title/Description/Content/Footer` | `card.tsx` | `variant: default/muted/raised/interactive`, `padding: none/sm/md/lg`, `rounded-card` |
| `Input`, `Textarea` | `input.tsx` | shared `controlBase` (`rounded-control`, `bg-input`, focus ring, `aria-invalid` styling) |
| `Field` | `field.tsx` | `label/description/error/required/htmlFor`; children may be a render prop receiving `{ id, describedBy, invalid }` for real label wiring; `role="alert"` on error |
| `Badge`, `StatusBadge` | `badge.tsx` | `toneStyles` map (`neutral/primary/success/warning/destructive/info/discord`) shared with `StatusDot`; `StatusBadge` moved here from `components/status-badge.tsx` (deleted) |
| `StatusDot` | `status-dot.tsx` | same tone map as `Badge` |
| `EmptyState` | `empty-state.tsx` | `icon/title/description/action/secondaryAction`, `size: sm/md` |
| `Skeleton` | `skeleton.tsx` | `bg-muted` + `animate-pulse`; `SkeletonCard` renders a `Card` |
| `SectionLabel` | `section-label.tsx` | quiet group label (`text-xs font-medium`, no uppercase/tracking) |
| `Tabs` | `tabs.tsx` | `role="tablist"`, underline indicator, arrow-key roving focus, optional `renderPanel` |

`StatCard` (`src/components/data/stat-card.tsx`) now renders a `Card`;
`shard-stats.tsx` uses it instead of a private duplicate.

Migrated off duplicated ad-hoc markup in Phase 2: the five
`servers/*-settings.tsx` files and three playlist modals now use
`Field` + `Input`/`Textarea` (the `inputClass` export and the settings-local
`Field` are gone); `data-table.tsx`, `shards`, `servers`, `track`,
`playlist-detail` use `EmptyState`; sidebar/dropdown/select/command-palette use
`SectionLabel`; `servers-page-skeleton.tsx` uses `Skeleton*`; `error-panel` and
`data-table` retry buttons use `Button`.

### Phase 3B — navigation & interaction primitives

**Tabs is the only in-page tab primitive.** `layout/navigation.tsx`
(`underline`/`pill`/`segment`) had zero real consumers after migration and was
deleted; the gallery documents `Tabs` alone. Two candidates moved over:

| Before | After | Behaviour kept |
| --- | --- | --- |
| `Navigation variant="pill"` in `servers/server-dashboard.tsx` | `Tabs` + `renderPanel` | all five settings panels stay mounted (`block`/`hidden`), so in-progress edits survive a tab switch |
| `Navigation variant="segment"` in `playlists/add-track-modal.tsx` | `Tabs` + `renderPanel` | URL / 검색 panels are controlled by props, so unmounting is safe |

Raw `<button>` was classified before touching anything (A action · B icon ·
C toggle · D selector/menu/option · E link/navigation · F mock/marketing).
25 of 50 became `Button`; the other 25 are **intentionally** raw — see §7.
Same for raw `<input>`: only `search-input.tsx` was API-compatible with
`Input`; the four popover/palette/chip fields keep their bespoke markup.

Token pass: `duration-200/300/500` → `duration-fast/base/slow` (value-identical)
and `text-[11px]` → `text-2xs` (value-identical) are done. `rounded-xl` on
dropdown/listbox rows → `rounded-menu` (identical 12px); the `rounded-xl`
overrides on newly-migrated `Button`s were dropped so they inherit
`rounded-control`.

## 7. Phase 3+ checklist

- [x] Migrate `glass-panel` / `glass-overlay` call sites (Phase 3A — 41/12 → 0/0)
- [x] `Navigation` → `Tabs` (Phase 3B: `/servers/[id]`, `add-track-modal`; component
      deleted, gallery documents `Tabs` only)
- [x] Migrate `duration-200/300/500` → `duration-fast/base/slow` (Phase 3B — 28 → 0)
- [x] `text-[11px]` → `text-2xs` (Phase 3B — 4 → 0, identical size)
- [ ] Remaining hero/marketing decoration: `text-title-gradient` ×6, `blur-[…]`
      glow blobs on `/`, `shadow-[…]` CTA glows on `/login`, `/invite`,
      `/not-found` — leave until the page-redesign phase
- [ ] Raw `rounded-xl` 29 → 18 / `rounded-2xl` 11 → 11. Converted only where the
      role and the value both matched (dropdown/listbox rows → `rounded-menu`,
      12px unchanged; `Button` radius overrides dropped → `rounded-control`).
      The 18 left are nav pills, decorative indicators, icon tiles, callouts and
      the Discord/gallery mocks — swapping them would change size or meaning.
- [ ] `text-[10px]` ×11: **no matching token** (`--text-2xs` is 11px), so they
      were not grown to `text-2xs`. Decide whether to add a 10px token or restyle
      the micro-labels in the page-redesign phase.
- [ ] Inline `StatCard` duplicate in `src/app/track/page.tsx`
- [ ] Raw `<input>` 5 → 4. Migrated: `search-input` (plain controlled text input,
      API-compatible). Retained: `tag-input` (chip field + Enter/Backspace chip
      handling), `role-select` / `select` (popover search, underline style),
      `command-palette` (palette search + activeIndex key handling).
- [ ] Raw `<button>` 50 → 25 in 15 files, classified before touching anything:
      **24 migrated** (14 `icon`, 6 `ghost`, 1 `secondary`, 1 `danger`, 2 `cta`);
      **1 removed** with `layout/navigation.tsx`; **25 retained** on purpose —
      5 inline/route links, 12 selector/menu/option/combobox rows, 7 Discord mocks
      (`guild-selector` has zero consumers), 1 custom carousel indicator.
- [ ] Remove `tailwind.config.ts` (dead under Tailwind v4)
- [ ] Delete `text-title-gradient` once its 6 brand headlines are decided

## 8. Hard rules

- No hard-coded hex/rgb in components. Use tokens.
- No new `dark:` branches for palette colors — redefine tokens in `.dark`.
- No arbitrary values for sizes that have a token (`text-[11px]`, `bg-[#…]`).
- Disclosed exceptions: Discord brand `#5865F2`, user-supplied embed colors,
  Discord role/avatar colors.
- `@layer base` scrollbar styling and `providers.tsx` are out of scope for
  styling changes.
- Never bulk-replace `<button>` → `<Button>` or `<input>` → `<Input>` (whole
  file, whole project, or regex). Classify first; a raw control that carries
  `role="option"` / `role="combobox"` / `role="menuitem"` / routing / mock
  semantics stays raw, and the report must say why.
- Never reintroduce `layout/navigation.tsx` — `Tabs` owns in-page tab panels.
  Route navigation, filters, segmented option pickers and mobile menus are
  **not** Tabs.
- `Button` variants are limited to
  `primary | secondary | ghost | danger | icon | state-toggle | cta`. Do not add
  `premium` / `success` / `glass` / `gradient` / `floating` variants, and do not
  create new button or input primitives.
