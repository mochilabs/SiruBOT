# SiruBOT Dashboard Design System

Single source of truth for the dashboard's visual foundation. The stylesheet
`src/app/globals.css` is normative; this document explains how to read and
extend it, and what must happen in later phases.

Historical status: **Phase 1 (tokens), Phase 2 (core primitives), Phase 3A (opaque
surface migration), Phase 3B (navigation / interaction primitives) and
Phase 3C (contrast/affordance hardening) complete.** Pages kept their
layout and behaviour; surface/border/elevation/radius expressions and the
primary palette were corrected to pass WCAG 2.1 while keeping the brand
identity. `.glass-panel` and `.glass-overlay` are gone; `.text-title-gradient`
is deleted (zero consumers). `layout/navigation.tsx` is gone —
in-page tab panels use `Tabs`.

2026-10-14 review baseline: `beta` at `3c2b558`. The responsive UX and floating
save-bar work in section 8 is planned, not implemented. Historical completion
statements above are not a new accessibility or browser verification result.

---

## 1. Where things live

| Concern | File |
| --- | --- |
| Tokens, theme mappings, utilities | `src/app/globals.css` |
| shadcn/ui config | `components.json` |
| `cn()` class combiner | `src/lib/utils.ts` |
| Font (Pretendard) + root layout | `src/app/layout.tsx` |
| Theme provider (`next-themes`) | `src/components/Providers.tsx` |
| Controls and overlays | `src/components/ui/*` |
| Composed primitives | `src/components/primitives/*` |
| Primitive showcase | `src/app/design/page.tsx` |

### Dependencies added (Phase 1)

| Package | Why |
| --- | --- |
| `clsx`, `tailwind-merge` | Implementation of `cn()` in `src/lib/utils.ts` |
| `class-variance-authority` | Variant API used by shadcn/ui components and `primitives/*` |
| `tw-animate-css` | `animate-in/out`, `enter/exit` keyframes required by shadcn/ui components |
| Local shadcn stylesheet | `src/styles/shadcn-tailwind.css` provides the retained styles; `shadcn` is not a current package dependency |

No class-merging package (`cn` npm package) is installed — `cn()` is ours.

---

## 2. `globals.css` structure

The stylesheet is divided into nine numbered sections. Keep them in this order.

1. **Tailwind & shadcn/ui integration** — `@import "tailwindcss"`,
   `@import "tw-animate-css"`, `@import "../styles/shadcn-tailwind.css"`, `@custom-variant dark`.
2. **Light & dark semantic theme variables** — `:root` and `.dark` blocks with
   the shadcn-compatible semantic palette plus Discord preview tokens.
3. **Tailwind theme mappings** — `@theme inline { --color-*: var(...) }`.
4. **Typography tokens** — `--font-sans`, `--text-2xs`.
5. **Radius & surface tokens** — `--radius*`, `--r-*`, `--surface-*`.
6. **Border & shadow tokens** — `--border-subtle/strong`, `--elev-1..3` + `--elev-5`,
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
| `--card` / `--card-foreground` | `var(--surface-1)` / `#3a2c30` | `var(--surface-1)` / `#fbeeee` | `bg-card` |
| `--popover` / `--popover-foreground` | `var(--surface-1)` / `#3a2c30` | `var(--surface-1)` / `#fbeeee` | `bg-popover` |
| `--primary` / `--primary-foreground` | `#ffdada` / `#4f1c2a` | `#ffdada` / `#3a1a22` | `bg-primary text-primary-foreground` |
| `--brand` | `#ee6f8b` | `#f98aa0` | 포인트 핑크 원본 — `--ring`·`--primary-control`의 소스 (유틸리티 없음) |
| `--primary-control` / `--primary-control-text` / `--primary-control-hover` | `var(--brand)` / `var(--primary-foreground)` / `#f27c96` | `var(--brand)` / `var(--primary-foreground)` / `#f27890` | solid on-state/CTA fills |
| `--primary-text` | `var(--accent-foreground)` (`#4f1c2a`) | `var(--accent-foreground)` (`#ffdada`) | accent text on neutral surfaces |
| `--secondary` / `--secondary-foreground` | `var(--surface-2)` / `#3a2c30` | `var(--surface-2)` / `#fbeeee` | `bg-secondary` |
| `--muted` / `--muted-foreground` | `var(--surface-2)` / `#7d686d` | `var(--surface-2)` / `#b9a4a9` | `bg-muted`, `text-muted-foreground` |
| `--accent` / `--accent-foreground` | `#ffc3c9` / `#4f1c2a` | `#4d3b40` / `#ffdada` | `bg-accent` |
| `--border` / `--input` | `#f3d3d6` / `var(--border)` | `#4d3b40` / `var(--border)` | `border-border`, `border-input` |
| `--border-subtle` / `--border-strong` | `#f8e1e4` / `#b4779b` | `#3a2c30` / `#a37d89` | `border-border-subtle`, `border-border-strong` |
| `--ring` | `var(--brand)` (`#ee6f8b`) | `var(--brand)` (`#f98aa0`) | `ring-ring` |
| `--dot-neutral` | `var(--muted-foreground)` | 동일 | `bg-dot-neutral` — 중립 상태 점·배지 dot 채움 |
| `--rank-1` / `--rank-2` / `--rank-3` | `#b47716` / `#8f8f8f` / `#b0743a` | `#f0b232` / `#b9bbbe` / `#cd7f32` | `text-rank-*`, 현행 랭킹 왕관 색상 |

서피스 슬롯(`--card`·`--popover`·`--secondary`·`--muted`)과 `--input`은 `--surface-*` / `--border`
단일 소스의 별칭이다 — 값 중복 정의를 만들지 말고 원본을 고칠 것.

### Surfaces (opaque, replaces glass for new work)

| Token | Light | Dark | Utility |
| --- | --- | --- | --- |
| `--surface-1` | `#ffffff` | `#2b2023` | `bg-surface-1` — base panel |
| `--surface-2` | `#fff0f0` | `#3a2c30` | `bg-surface-2` — nested / inset area |
| `--surface-3` | `#ffffff` | `#3a2c30` | `bg-surface-3` — floating overlay · 중립 컨트롤 hover 단계 |

`--surface-3`의 원래 역할은 플로팅 오버레이지만, `bg-secondary → hover:bg-surface-3`
관례(secondary·icon 버튼의 hover)가 정착해 공식 관례로 승격됐다.

장식 아바타 헤일로는 `ring-4 ring-primary/10`(작은 아바타는 `ring-2 ring-primary/20`) 관례를
그대로 쓴다 — 포커스 링이 아니므로 `ring-ring` 계열과 섞지 않는다.

### Radius

`--radius: 1rem` is the base. `rounded-sm / md / lg` keep their exact previous
formulas, so existing markup is visually unchanged. `rounded-xl / 2xl / 3xl`
are untouched Tailwind defaults — `rounded-lg` 소비처는 역할 토큰
(`rounded-card` 등)으로 이전했으므로 새 코드에서 `rounded-lg`를 쓰지 않는다.

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

Elevation steps replace Tailwind's defaults:

| Utility | Token | Use |
| --- | --- | --- |
| `shadow-sm` | `--elev-1` | hairline separation |
| `shadow-md` | `--elev-2` | resting cards |
| `shadow-lg` | `--elev-3` | raised cards, headers |
| `shadow-2xl` | `--elev-5` | menus, popovers, modals |

`shadow-xs` / `shadow-xl`은 소비자 0으로 삭제됐다 — 대응 `--elev-4`도 함께 정리했다.
Shadows express elevation only — never decoration.

### Status colors

| Token | Light | Dark |
| --- | --- | --- |
| `--success` / `-foreground` | `#0f7a52` / `#ffffff` | `#34d399` / `#052e16` |
| `--warning` / `-foreground` | `#9a6100` / `#ffffff` | `#fbbf24` / `#451a03` |
| `--info` / `-foreground` | `#0b6bb0` / `#ffffff` | `#38bdf8` / `#082f49` |
| `--destructive` / `-foreground` | `#d4183d` / `#ffffff` | `#ff7b8a` / `#2b1018` |

Utilities: `bg-success`, `text-warning`, `bg-destructive`. Use `Badge` and
`StatusDot` for status presentation. `StatusBadge` is not a current component.

### Typography

- `--font-sans` references `var(--font-stack)`: Pretendard, Pretendard JP,
  Twemoji Mozilla, native emoji fonts, and system fallbacks.
- `--text-2xs` = `0.6875rem` / `1rem` line-height → `text-2xs`. Replaces the
  `text-[11px]` arbitrary value (identical size) — done in Phase 3B.
  `text-[10px]` has **no** matching token (2xs is 11px), so those 11 dense
  micro-labels were left alone rather than silently grown.
- `--text-3xs` = `0.5rem` / `0.75rem` line-height → `text-3xs` (8px). 썸네일
  워터마크 등 8px 마이크로 라벨 전용. `text-[8px]` 임의값을 대체한다.

### Motion

| Token | Value | Interface |
| --- | --- | --- |
| `--motion-fast` | `200ms` | `duration-fast` |
| `--motion-base` | `300ms` | `duration-base`, `animate-page-in` |
| `--motion-slow` | `500ms` | `duration-slow` |
| `--ease-out-expo` | `cubic-bezier(.16,1,.3,1)` | `ease-standard` |

컨트롤 공통 트랜지션은 `transition-control` 유틸리티(color / background-color /
box-shadow)를 쓴다 — button·input·textarea·tag-input이 같은 임의값을 쓰던 자리다.

MOTION 다이얼: **2** (스크롤 리빌 + 전환). 기록된 사유 기반 예외:
`animate-marquee`(슬래시 커맨드 문화 제시 identity motif, hover 일시정지 있음), `BackgroundShapes`(배경 identity
모티프 — 도형 3개로 제한, `hidden md:block`, reduced-motion 시 정지). 두 장식은 R-19 사유가 코드 주석과 이 문서에
기록되어 있으므로 허용되며, 새 무한 루프 장식을 추가하려면 같은 방식으로 사유를 기록해야 한다.

Use named durations for new work. Existing numeric duration utilities do not
justify introducing new values when a matching token exists.

Accessibility: a `prefers-reduced-motion: reduce` block zeroes animation and
transition durations globally. `MotionConfig reducedMotion="user"` handles
framer-motion separately.

---

## 4. Contrast rules

All text must meet WCAG 2.1 AA:

- Normal text: 4.5:1 minimum.
- Large text (24 CSS px regular, or approximately 18.67 CSS px bold): 3:1 minimum.
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
  <p className="text-sm font-medium text-muted-foreground">{description}</p>
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
<span className="text-primary">강조</span> // Use text-primary-text on neutral surfaces.
```

- Exceptions: Discord brand (`#5865F2`), `EmbedPreview` embed color (user input),
  avatar/role colors from Discord.

---

## 7. Related documents

- `apps/dashboard/MEMO.md` — past redesign notes; may be stale; code wins.
- Project root `AGENTS.md` — build commands and repo conventions.

## 8. Responsive UX and floating save bar

Implementation update (2026-10-14): the shared header/panel guidance now wraps,
four shared settings forms compare an editable saved baseline and serialize
submits, and the live player isolates guild state and exposes recovery. See
the [bounded audit and validation record](../../docs/audits/2026-10-14-dashboard-ui-ux.md).
The floating save bar now appears only for dirty/pending active panels through
the existing portal. Inactive drafts remain registered. AI history deletion
remains in the form; profile revert remains alongside save. Mobile uses 16px
viewport insets; desktop uses a centered, maximum 760px island within the panel
column. The rendered bar height reserves form clearance. Toasts use a separate
top viewport with readable non-overlapping notices. Full authenticated and
real-device keyboard acceptance remains unverified.

### Scope and direction

The user approved planning and design-document updates, desktop/mobile UX
improvements, and a floating save bar shown only for unsaved changes.
Implementation tasks are in [the responsive UX plan](../../docs/plans/2026-10-14-dashboard-responsive-ux.md).
Product direction is in [the root design document](../../DESIGN.md).

Keep `ENERGY 2 / RHYTHM 2 / MOTION 2`, the current pink/maroon palette,
Pretendard, and both themes. Settings should emphasize the current task,
readable field groups, and one primary save action. Use existing icons for
their actual functions. Use opaque surfaces and a shadow only to distinguish
the floating bar from the form beneath it. No new visual assets are needed.

### Verified source observations

| Source | Observation | Planned response |
| --- | --- | --- |
| `src/components/servers/settings-shared.tsx`, `SaveBar` | Always renders a `sticky bottom-0` card footer; registers dirty state in a module map | Separate persistent dirty registration from conditional floating presentation |
| `src/components/servers/server-dashboard.tsx` | Nine tabs, mobile horizontal strip, desktop sidebar, `keepMounted` panels | Preserve drafts and URL selection; explicitly render floating actions only for the active panel |
| `src/app/globals.css`, `animate-page-in` | Page animation uses a transform and `both` fill mode | Render fixed save UI through the existing portal, outside transformed page ancestors |
| `src/components/servers/ai-settings.tsx` | History deletion is a `SaveBar` child | Move deletion into the history section so clean-state access remains available |
| `src/components/servers/bot-profile-settings.tsx` | Save bar owns an existing form-revert action | Keep revert with profile save actions |
| `src/hooks/use-guild-settings.ts`, `useSettingsForm` | Dirty is set on edit; background data does not overwrite a dirty draft | Preserve draft protection; define net-change detection and pending-save behavior before modifying the hook |
| `src/components/layout/page-header.tsx` | Both title and description use `truncate` | Allow prose to wrap; retain truncation only for bounded identifiers with a way to read the full value |
| `src/components/servers/settings-shared.tsx`, `PanelHeader` | Header action sits beside the title without a narrow-layout stack | Stack actions below text on narrow screens; add shrinking/wrapping constraints |

These are source observations, not browser-confirmed failures. Measure contrast,
overflow, focus, and touch targets during implementation.

### Save-bar state contract

| State | Floating UI | Behavior |
| --- | --- | --- |
| Clean, loading, or inaccessible settings | Hidden | No disabled save footer; independent actions remain in the form |
| Active panel has changes | Visible | `저장하지 않은 변경 사항` and `변경 사항 저장` |
| Saving | Visible until the request settles | `저장 중…`; prevent duplicate save, revert, and further edits to that submitted form |
| Save succeeds with no remaining changes | Hidden | Existing success feedback; restore focus if the focused action disappears |
| Save fails | Visible with draft intact | Announce the failure and keep save available for retry after the request settles |
| Validation fails | Visible | Identify and focus the invalid field; do not send an invalid request |
| User restores all original values or uses supported revert | Hidden once clean | Compare normalized editable values with the saved baseline |
| Another tab has a draft | Hidden for that tab | Keep its registration and draft; switching back reveals its actions |

Keep dirty registrations mounted even when the floating UI is hidden. The
server switcher uses `hasUnsavedSettings()` to warn about drafts across tabs.
The floating bar does not introduce a global Save All or shared transaction.
Member greeting retains its existing welcome/goodbye save behavior, including
any partial-failure handling. JTC retains its setup-in-progress lock.

Use explicit active-tab information from the shell. A portal is outside the
hidden tab's DOM ancestry, so relying on a hidden parent would expose inactive
save controls. Preserve `keepMounted`; do not remount forms to hide their bars.

### Placement and accessibility

- Narrow layouts: 16px side spacing where it fits, a bottom gap plus
  `env(safe-area-inset-bottom)`, full available width, and wrapping status text.
  Stack status above the action row when necessary. Buttons have at least
  44×44px touch areas, with spacing between them.
- Wide layouts: constrain the bar to the settings content column, with a
  comfortable maximum width and the same bottom safe-area treatment.
- Use `bg-surface-3`, `text-foreground`, `rounded-card`, existing `Button`
  variants and elevation tokens. Avoid blur, decorative glow, and pill styling.
- Reserve the measured wrapped bar height plus clearance in the form and its
  scroll padding. The last field and error message must remain reachable.
- Establish layering below modal/dialog backdrops and menus. Keep toasts clear
  of the bar, and verify pointer events only cover the bar, not a full-screen
  invisible overlay.
- Keep status announcements separate from the buttons using a polite live
  region. Show errors as text. Do not move focus when the bar first appears.
  If a focused save/revert control disappears, return focus to a stable panel
  heading or form target. Portal focus order must be verified with keyboard use.
- Test mobile keyboard opening, scrolling, rotation and dismissal. The focused
  field and save action must stay reachable. Use a visual-viewport adjustment
  only if device testing requires it; clean up listeners and avoid UA sniffing.
- Respect reduced motion and do not animate the page's layout on every edit.

### Responsive improvement priorities

1. Settings headers, explanations, and form groups: mobile stack, readable
   labels, contained long names and URLs; use side-by-side fields only when
   both remain readable. Keep essential Korean guidance at least 14px.
2. Settings navigation: make the existing horizontal strip discoverable and
   its selected item visible, with 44px targets. Respect reduced motion for
   automatic scrolling. Keep desktop sidebar access and URL/back behavior.
   Replacing the navigation pattern is a separate decision after observation.
3. Shared page headers: wrap descriptions, scale long headings, and allow
   action groups to reflow without truncating explanatory content.
4. Playlist selection and list/player controls: inspect narrow and intermediate
   widths, long titles and action access. Apply changes only to reproduced
   issues; preserve keyboard and touch equivalents and existing virtualization.
5. Public pages: inspect navigation, headline wrapping, real content, and
   mobile spacing after the settings workflow. Preserve established brand
   motifs and avoid broad aesthetic changes without evidence.

### Decision log

| Decision | Alternative considered | Reason |
| --- | --- | --- |
| Unsaved-only floating save bar | Always-visible disabled bar | User chose unsaved-only; clean forms recover screen space |
| One active panel's actions | Global Save All | Preserves existing endpoints, validation and per-panel ownership |
| Reuse `SaveBar` and portal | New app-wide action registry | Keeps scope local and avoids another state-management layer |
| Source-backed, incremental cleanup | Full dashboard rebuild | Retains working patterns while prioritizing concrete usability issues |
| CSS as token authority | Duplicate complete root token dictionary | Prevents conflicting palettes and removed-component guidance |

### Acceptance and evidence

Verify 320, 375, 768, 1024 and 1440 CSS px plus intermediate widths, light/dark,
200% zoom, keyboard-only and reduced motion. Record actual outcomes for clean,
dirty, validation failure, saving, success, network failure, tab switching,
server switching, revert, history deletion, and keyboard-open layouts.
No page-level horizontal overflow; locally scrollable tabs/tables remain
contained and discoverable. Check normal text at 4.5:1 and required non-text
indicators at 3:1, including actual opacity composites and focus rings.

The original plan's full acceptance matrix remains pending. The bounded
reliability/header patch has automated and controlled-browser evidence in the
audit record linked above; it does not establish full dashboard acceptance.
