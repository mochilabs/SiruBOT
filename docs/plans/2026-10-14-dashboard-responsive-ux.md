> **상태**: 부분 구현 — #77(`d2de51fd`)에서 Task 1~3·5 일부가 코드상 구현됨(controlled fixture 렌더만, 실기기·실제 길드 미검증). Task 4·6은 미완/판정 불가 항목 잔류.

# Dashboard Responsive UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve desktop/mobile dashboard usability and replace sticky settings footers with an unsaved-only floating save bar.

**Architecture:** Retain per-panel form ownership, endpoints and mounted tab drafts. Adapt the existing `SaveBar`, render its floating presentation through the existing portal, and pass explicit active-panel visibility from the server shell. Keep CSS tokens authoritative and use existing controls.

**Tech Stack:** Next.js 16.4, React 19.3, Base UI 1.9, Tailwind 4, SWR, Vitest and happy-dom. No new dependency is planned.

---

## Baseline and approved scope

Date: 2026-10-14. Source baseline: `beta`, `3c2b558`.
Planning branch: `docs/dashboard-responsive-ux-plan`.
The user approved planning/documentation first, desktop and mobile improvements,
and a floating bar only when changes are unsaved. Implementation is pending.

Read [root direction](../../DESIGN.md) and [dashboard UX contract](../../apps/dashboard/DESIGN.md#8-responsive-ux-and-floating-save-bar-planned).
The latter contains the state table, placement, decision log and acceptance criteria.

Assumptions: existing traffic/data scale and permissions; no new availability
target, polling or backend transaction; no added dependency. Preserve local
drafts on recoverable failures. Maintain the shared component system and limit
cleanup to inspected consumers. Performance acceptance is no extra network
requests or duplicate form mounts caused by this change. Product metrics and
load-test claims are not part of this plan.

## Task 1: Capture the current interactions

**Read:**
- `apps/dashboard/src/components/servers/settings-shared.tsx`
- `apps/dashboard/src/components/servers/server-dashboard.tsx`
- `apps/dashboard/src/components/servers/server-switcher.tsx`
- `apps/dashboard/src/hooks/use-guild-settings.ts`
- `apps/dashboard/src/hooks/use-bot-profile.ts`
- `apps/dashboard/src/hooks/use-member-greeting.ts`
- `apps/dashboard/src/components/ui/toast.test.tsx` (existing DOM test conventions)

1. Verify branch/worktree and preserve unrelated local changes. Use a feature branch based on beta/main for implementation.
2. Read applicable AGENTS.md, dashboard/design/component skills and installed Next.js docs before code changes. Query current Context7 docs for APIs actually changed.
3. Start the dashboard with `yarn workspace @sirubot/dashboard dev` and use an authorized test guild or controlled fixtures.
4. Capture settings at 375, 768 and 1440px in both themes: clean/dirty form, hidden dirty tab, failed save, profile revert, history deletion, JTC setup and greeting save.
5. Inspect each of the seven save handlers and record validation, reset, pending and partial-success behavior. Do not assume all panels use `useSettingsForm`.

Expected result: a reproducible interaction baseline. Authentication or service
blockers must be recorded; fixture results do not prove live Discord behavior.

## Task 2: Lock draft and save behavior

**Create:**
- `apps/dashboard/src/components/servers/settings-shared.test.tsx`
- `apps/dashboard/src/hooks/use-guild-settings.test.tsx`

**Modify only when the tests require it:**
- `apps/dashboard/src/hooks/use-guild-settings.ts`
- The corresponding panel-specific hook/handler identified in Task 1

1. Follow the existing happy-dom/React test setup rather than adding a test dependency.
2. Add behavioral cases for a dirty inactive panel staying registered, cleanup on unmount, one visible active save action, and no bar for clean forms.
3. Add deferred-promise cases: failed save retains the draft; background revalidation does not overwrite it; repeated submit creates one request; pending controls prevent edits from being lost to the response.
4. Test net-change behavior: edit a scalar, restore its saved value, expect clean; test a representative list with its existing ordering semantics. Normalize actual editable values, not the whole remote payload.
5. Run the focused tests and confirm the new behavior fails before implementation. Keep currently passing draft-protection cases as regressions.

Run: `yarn workspace @sirubot/dashboard test src/components/servers/settings-shared.test.tsx src/hooks/use-guild-settings.test.tsx`

The shared hook currently marks any patch dirty; this is not a net-difference
comparison. Introduce a saved editable baseline only where needed. Do not add
a generic deep-equality dependency or treat set-like and ordered lists alike.
Use the smallest local comparison supported by each existing form shape.

## Task 3: Implement the floating presentation

**Modify:**
- `apps/dashboard/src/components/servers/settings-shared.tsx`
- `apps/dashboard/src/components/servers/server-dashboard.tsx`
- `apps/dashboard/src/components/servers/ai-settings.tsx`
- `apps/dashboard/src/components/servers/bot-profile-settings.tsx`
- `apps/dashboard/src/components/servers/music-settings.tsx`
- `apps/dashboard/src/components/servers/channel-settings.tsx`
- `apps/dashboard/src/components/servers/jtc-settings.tsx`
- `apps/dashboard/src/components/servers/mixer-settings.tsx`
- `apps/dashboard/src/components/servers/member-greeting-settings.tsx`

**Reuse:** `apps/dashboard/src/components/overlay/portal.tsx`, `ui/button.tsx`.

1. Pass an explicit active boolean from each tab to its settings component and then to `SaveBar`. Preserve greeting's existing `visible` behavior. Do not add an app-wide action store.
2. Keep `SaveBar` mounted and its dirty-registration effect unconditional. Gate only portal rendering on active and dirty/saving state.
3. Render the bar through `Portal` to escape transformed page ancestors. Preserve form ownership, validation and each existing save callback.
4. Position the bar relative to the settings column on desktop and safe viewport insets on mobile. Start with CSS layout; if column geometry needs measurement, observe a local anchor rather than hard-coding sidebar widths.
5. Measure the rendered bar height for bottom clearance and scroll padding. Clean up any observer. Test wrapped text and two-row actions rather than assuming a fixed height.
6. Implement Korean labels, a polite status region, pending locking, visible failure feedback and focus restoration when focused controls disappear.
7. Move AI history deletion to its history section with its existing confirmation behavior. Preserve profile revert in the floating actions; preserve JTC setup locking.
8. Check dialog/menu/toast layering, pointer-event bounds, and inactive-panel portals. Never rely on a hidden tab ancestor to hide portalled controls.
9. Run Task 2 tests until green and inspect the browser state matrix before moving on.

Base UI 1.9 Context7 documentation confirms `keepMounted` retains hidden
panels and inactive panels are hidden/inert. A portal escapes DOM ancestry;
explicit visibility is therefore required. Do not remove `keepMounted` to fix
overlap, because doing so would discard local drafts.

## Task 4: Improve settings layout and navigation

**Modify:**
- `apps/dashboard/src/components/servers/settings-shared.tsx` (`PanelHeader`, `InfoBox`, `WarningBox`)
- `apps/dashboard/src/components/servers/server-dashboard.tsx`
- `apps/dashboard/src/components/servers/server-feature-sidebar.tsx`
- The Task 3 settings panels where reproduced layout issues occur

1. Give narrow headers a stacked text/action layout; use `min-w-0` and wrapping for long labels.
2. Increase essential explanation/validation text from dense caption sizing to readable body sizing. Keep compact metadata only where it remains usable.
3. Group related fields without redundant nested cards. Stack previews beneath editors at narrow widths; introduce columns only when content fits.
4. Keep the existing tab-strip/sidebar pattern. Make the mobile strip's overflow discoverable, keep the selected item visible and ensure touch targets are at least 44px.
5. Respect reduced motion for programmatic tab scrolling. Check keyboard selection and URL query/back behavior.
6. Measure actual sidebar focus contrast, including its `/40` opacity, before choosing a correction. Reuse established focus treatment rather than inventing another token.
7. Resize continuously across phone, tablet and desktop widths; record long-name and zoom outcomes.

Expected result: all settings destinations remain reachable and forms reflow
without page overflow. No new navigation destinations or mobile-only copies
of the forms are introduced.

## Task 5: Shared headers and adjacent UI review

**Inspect/modify when justified:**
- `apps/dashboard/src/components/layout/page-header.tsx`
- `apps/dashboard/src/components/playlists/playlist-select-mobile.tsx`
- `apps/dashboard/src/components/playlists/playlist-sidebar.tsx`
- `apps/dashboard/src/components/track.tsx`
- `apps/dashboard/src/components/player/player-live-tab.tsx`
- `apps/dashboard/src/components/navbar.tsx`
- `apps/dashboard/src/components/home/hero-section.tsx`

1. Replace forced truncation of explanatory prose in `PageHeader` with wrapping. Check long ReactNode titles, including the server switcher, before changing heading behavior.
2. Let header actions wrap/stack with visible labels at narrow and intermediate widths.
3. Check playlist selector, long track titles, player controls and navigation for touch-only access, target size and localized overflow.
4. Inspect the public hero for heading/CTA wrapping and mobile spacing. Record observed issues before editing it; do not restyle unrelated sections.
5. Verify loading, first-use empty, filtered-empty, permission and retry states for touched data views.
6. Delete only confirmed obsolete styles/imports/wrappers after migration. Search references first; keep panel wrappers that own real behavior or state boundaries.

This task is a bounded review queue, not a claim that every listed component
is defective. Prefer browser checks to tests that merely mirror class names.

## Task 6: Verify and document the result

**Update:** `DESIGN.md`, `apps/dashboard/DESIGN.md`, this plan's execution record.

1. Run focused tests from Task 2, then the dashboard suite.
2. Run lint, generation and dependency-aware typechecking.
3. Build and start the dashboard; review console errors during the walkthrough.
4. Record each matrix case below, including any blocked live-service case.
5. Update planned sections to implemented only for completed, verified work; record remaining work explicitly.

Commands from repository root:

```bash
yarn workspace @sirubot/dashboard lint
yarn generate
yarn turbo typecheck --filter=@sirubot/dashboard
yarn workspace @sirubot/dashboard test
yarn turbo build --filter=@sirubot/dashboard
python3 scripts/wcag-contrast-audit.py
git diff --check
```

Expected: successful exits, passing tests, and contrast audit reporting
`Unexpected failures: 0`. Inspect expected contrast exceptions separately;
the script alone does not certify opacity composites or all focus indicators.

### Browser acceptance matrix

| Check | Required observation |
| --- | --- |
| Clean / edit / restore | Hidden, visible, hidden; actions remain reachable |
| Valid save | One request; pending lock; success announcement; bar disappears; focus retained sensibly |
| Validation / failed request | Actionable error; invalid field reachable; draft preserved; retry works |
| Two dirty tabs | Only active bar visible; inactive draft retained; correct callback used |
| Server switch | Existing unsaved warning includes inactive drafts; cancel retains work |
| Independent actions | AI history deletion reachable while clean; confirmation preserved; profile revert works |
| JTC / greeting | Pending setup locks save; greeting errors do not falsely announce all saved |
| Last field / overlays | Bar never covers final control, error, menu, modal or toast |
| Mobile keyboard | Focused input and save remain reachable on actual keyboard opening/dismissal |
| Layout | 320/375/768/1024/1440px and intermediate widths; no page horizontal overflow |
| Accessibility | Both themes, 200% zoom, keyboard order, visible focus, reduced motion, 44px targets |
| Data / performance | No duplicate mounts/requests; long lists retain existing loading and virtualization behavior |

### Planning delivery record

Source inspection completed for the shared save bar, shell, seven consumers,
draft hook, server switcher, tokens, shared header and mobile playlist selector.
The broader UI queue still requires browser inspection. No application code
has been changed by this planning task; no runtime or visual pass is claimed.

Documentation gates: verify relative Markdown links, front-matter syntax,
referenced file paths, core palette agreement with CSS and `git diff --check`.
The implementation delivery gate remains the browser matrix and commands above.

Planning checks run on 2026-10-14:
- PASS: local Markdown link targets and code fences checked in all three documents.
- PASS: 23 existing implementation-reference paths exist; the two proposed tests are explicitly marked for creation.
- PASS: root YAML parsed with the installed `js-yaml`; every summarized web color matches `globals.css`.
- PASS: `git diff --check` reported no whitespace errors.
- PASS (planning scope): brand direction, purpose, approved save behavior, failure states and responsive acceptance criteria are documented with source references.
- Runtime delivery gate is pending implementation: no browser, build, contrast or application-test pass is claimed by these documentation checks.
