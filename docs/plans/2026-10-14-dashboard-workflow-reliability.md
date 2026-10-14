# Dashboard Workflow Reliability Implementation Plan

**Goal:** Repair source-confirmed settings and live-player state defects, then improve shared header reflow without changing service contracts.

**Architecture:** Keep SWR as the server cache and local forms as draft owners. Compare editable scalar/ordered-array values against a saved baseline, serialize submits, and isolate player state by guild identity. Reuse existing controls and semantic tokens.

**Tech Stack:** Next.js 16.4, React 19.3, SWR 2.4, Base UI, Tailwind 4, Vitest/happy-dom.

Baseline: `beta`, `7a213eb`; implementation branch: `fix/dashboard-workflow-reliability`. No existing working-tree changes. `localdocs/` is absent.

## Batch 1: Settings integrity

- Add `apps/dashboard/src/hooks/use-guild-settings.test.tsx` using controlled SWR data and deferred HTTP responses.
- Reproduce restored-value dirty state, duplicate submit, pending edits, failed-save draft preservation, and background-revalidation protection.
- Update `useSettingsForm` in `apps/dashboard/src/hooks/use-guild-settings.ts`: retain an editable baseline, preserve array order, share a pending promise, and prevent edits during submit.
- Isolate the settings shell by guild identity while preserving mounted drafts across tabs.
- Run focused tests before and after the repair.

## Batch 2: Live-player recovery and context

- Add `apps/dashboard/src/components/player/player-live-tab.test.tsx` with controlled snapshots, EventSource, and command responses.
- Reproduce cross-guild snapshot retention, initial SSE wait despite an available HTTP snapshot, and absent retry controls.
- Key the live session by guild; remove cross-key previous data; ignore events from closed sources; fall back to the same-guild HTTP snapshot while SSE starts.
- Reuse `PanelError` for recovery. Mark stale/reconnecting snapshots explicitly, freeze uncertain progress, and disable commands until authoritative state is available.
- Remove indefinite pause/repeat optimistic overrides; keep actual state until a new snapshot confirms the action. Keep volume draft input scoped to its request and serialize volume writes.
- Run focused tests and dashboard tests.

## Batch 3: Responsive shared surfaces

- Update `src/components/layout/page-header.tsx` to wrap titles/guidance and action groups rather than truncate prose.
- Update `PanelHeader`, `InfoBox`, and `WarningBox` in `src/components/servers/settings-shared.tsx` for narrow-screen stacking and readable guidance.
- Increase live playback action targets to 44px; give volume a full-width mobile row and preserve long track text.
- Honor reduced motion in settings-tab auto-scrolling.
- Inspect rendered public/design pages in both themes and representative widths; authenticated workflows require authorized state or explicit fixtures.

## Validation and scope limits

Run dashboard lint/tests, `yarn generate`, dependency-aware typecheck/build, contrast audit, and `git diff --check`. Record actual commands/results in the audit report.

Preserve routes, permission gates, API schemas, seven panel save handlers, independent history deletion, and existing mounted tab drafts. Do not roll out the floating save bar in this batch: its seven-panel pending/focus/portal contract remains the next coherent implementation. Do not test mutations against production.

## Approved follow-up execution

The user subsequently approved the floating island, switch-confirm modal,
searchable switcher layout, rounding repairs and player failure investigation.
The original floating-bar deferral above is superseded. The follow-up reuses
SaveBar/Portal, local active-panel context, Dialog/Sheet and Base UI Popover.
It retains the seven callbacks, hidden drafts, AI history deletion and profile
revert. Regression and controlled-browser evidence is recorded in the
[audit follow-up](../dashboard-ui-ux-audit-2026-10-14.md#follow-up-implementation-after-user-approval).
The bot permission-method binding defect was reproduced with real Discord
permission objects and repaired without changing the permission policy.
