# Dashboard UI/UX audit and implementation

Date: 2026-10-14. Baseline: `beta`, `7a213eb`. Branch: `fix/dashboard-workflow-reliability`.

## Outcome and coverage

Implemented a bounded reliability/accessibility batch, not a complete dashboard redesign. Read the existing design guides, routing, settings shell, four shared-form consumers, player proxy contracts, live UI, playlist hook/selector, navigation, tokens, and test configuration. Rendered `/design`, the public homepage, and a temporary local fixture composed of the actual music-settings, page-header, and live-player components. The fixture and its generated route stub were removed before the production build.

The architecture is Next.js 16.4 App Router, React 19.3, Tailwind 4, Base UI-based shadcn controls, SWR server data, zustand UI flags, and next-auth Discord authentication. Player snapshots originate in bot Redis publication, are cached by data-api, and reach the dashboard through authorized HTTP/SSE proxies. Commands use the existing bot request/reply path; a command acknowledgement is not a new player snapshot.

Preserved strengths: semantic light/dark tokens, Pretendard, existing controls, server-side permission gates, Korean errors, mounted tab drafts, playlist virtualization, and centralized notifications. No dependency, endpoint, permission, polling interval, or backend behavior was changed.

## Prioritized findings

Scores use impact × frequency × severity × confidence / effort. Frequency is an engineering estimate, not measured product analytics.

| Priority | Finding and evidence | I/F/S/C/E | Score | Status |
| --- | --- | --- | --- | --- |
| P1 | `player-live-tab.tsx`: local SSE state survives `guildId` changes, while controls target the new guild; reproduced by DOM regression | 5/3/5/5/2 | 187.5 | Fixed with keyed session and closed-source guard; previous-key data disabled |
| P1 | `use-guild-settings.ts`: repeated submit starts two PUTs; edits during submit can be overwritten by its response; duplicate request reproduced | 5/3/4/5/2 | 150 | Fixed with shared pending promise and pending draft lock |
| P1 | Live-player pause/repeat overrides can persist indefinitely when snapshots disagree; stale snapshots still enable commands | 4/4/4/5/2 | 160 | Fixed: snapshot-confirmed controls, stale/reconnecting lock, bounded volume draft |
| P1 | Initial live HTTP data/errors ignored until SSE yields data or fails; polling error lacks retry | 4/4/3/5/2 | 120 | Fixed: HTTP startup fallback and shared error/retry presentation |
| P2 | Shared forms mark any edit dirty, even after restoring saved values | 3/4/2/5/1 | 120 | Fixed with editable baseline and ordered-array comparison |
| P2 | Shared page header truncates descriptions and titles; panel headers do not stack actions | 4/4/2/5/1 | 160 | Fixed with wrapping and responsive action layout |
| P1 | Mobile navigation trigger has no accessible name; confirmed in production browser accessibility lookup | 4/5/3/5/1 | 300 | Added Korean open/close labels and expanded state |
| P2 | Live volume slider wrapper remains content-sized even in a wide row; observed in fixture screenshot | 3/5/2/5/1 | 150 | Wrapper now flexes, has a named native range, and occupies a mobile row |
| P2 | `servers/[id]/page.tsx`: Discord 429/5xx resolve to `null`, then `notFound()`; source-confirmed temporary failure presented as absence | 4/3/3/5/2 | 90 | Remaining; needs page-level recovery contract |
| P2 | `use-playlists.ts`: list/detail SWR errors are not exposed to the page | 4/3/3/5/2 | 90 | Remaining; source finding, not browser-reproduced |

## Implemented decisions and trade-offs

- Retain the pink/maroon tokens and Pretendard: preserve established identity and Korean readability. Dials remain ENERGY 2 / RHYTHM 2 / MOTION 2.
- Compare mapped editable values rather than the entire settings payload: unrelated panel updates do not create false changes. Current values are scalars and string arrays; array ordering remains significant, matching existing request semantics.
- Protect the original baseline during dirty revalidation: server refreshes cannot silently erase local work. Concurrent edits by other users still require a future conflict-resolution design.
- Share one in-flight submit and reject pending edits: one authoritative response cannot erase newer input. Four existing consumers already disable their controls while saving.
- Key settings/player trees only when guild identity changes: discard cross-server state without discarding drafts on tab switches. Server-switch confirmation remains intact.
- Display snapshot-confirmed pause/repeat: an accepted command never becomes an invented playback state. Trade-off: labels wait for the next snapshot rather than changing optimistically.
- Serialize volume requests and clear local volume intent when the request settles: older responses cannot overwrite a newer volume command. The value may briefly return to the previous snapshot until the bot publishes the new one.
- Disable commands during stale/reconnecting state and freeze progress: uncertainty is visible and users cannot act on outdated context. Opening the transport alone does not establish freshness; a valid state event does.
- Wrap heading, description, and current-track text: retain information at narrow widths. Very long track names increase card height intentionally.
- Keep 44px live actions and a separate narrow-screen volume row: finger targets and the slider remain usable without hiding functionality.
- Honor reduced motion in tab scrolling: programmatic navigation should not override the user's motion preference.
- Add a mobile-menu name/state without replacing navigation: repair assistive-technology discovery with no new navigation pattern.

## Validation evidence

### Automated

- `yarn install --immutable`: exit 0, existing peer-dependency warnings, no manifest/lockfile changes.
- `yarn workspace @sirubot/dashboard test ...`: could not locate `vitest` in the workspace script environment, even after install. Used the installed executable directly instead.
- `node ../../node_modules/vitest/vitest.mjs run` from `apps/dashboard`: 6 files, 47 tests passed. Eleven added regression cases cover baseline restoration, background protection, deduplicated/pending saves, failed-save retry, HTTP startup data, guild switching/closed events, initial error retry, stale/reconnecting locks, confirmed pause state, and rapid command deduplication.
- Red/green evidence: original settings implementation failed three of four initial cases; original player implementation failed all five initial cases. Added command/reconnect cases subsequently passed.
- `node ../../node_modules/eslint/bin/eslint.js . --max-warnings=0`: exit 0.
- `yarn generate`: successful cached Prisma generation.
- `yarn turbo typecheck --filter=@sirubot/dashboard`: exit 0. A temporary generated fixture type caused an earlier failure; removed only that generated stub after stopping dev.
- `yarn turbo build --filter=@sirubot/dashboard`: successful production compilation, TypeScript, and prerendering. Temporary fixture absent from route output.
- `git diff --check`: exit 0.
- `python3 scripts/wcag-contrast-audit.py`: blocked, script does not exist in this checkout. No complete contrast-audit pass claimed.

### Browser interaction record (controlled local responses)

| Element/state | Actual observation |
| --- | --- |
| Related-track switch → save | Successful PUT, success toast, clean/disabled save afterward |
| Save failure | Controlled 502 displayed, edited value retained, save still available |
| Retry save | Successful request after failure; three PUTs total for three save actions |
| Guild switch | Fixture A text removed, fixture B text appeared |
| Pause via keyboard Enter | One `pause` command; label remained snapshot-confirmed |
| Skip / stop / repeat via Enter | Existing command bodies sent correctly to mocked local endpoints |
| Volume via ArrowRight | One debounced `volume` request with value 101 |
| Live read failure → retry | Korean API failure shown; retry fetched controlled empty-player response |
| Empty live state | `지금은 재생 정보가 없어요` visible after recovery |
| Viewports | Fixture document width equalled viewport at 320/360/390/430/768/1024/1280/1440px in both themes |
| Touch targets | Live pause/skip/stop measured 44px high |
| Slider layout | Live slider measured 216px wide at 320px viewport after fixing its wrapper |
| Enlarged text | 200% root font-size at 390px caused no document overflow; not equivalent to full browser zoom/device-keyboard testing |
| Public homepage | Production render had no document overflow at 320/390/768/1024/1440px and no page exceptions in that walkthrough |
| Mobile menu | Final production build: focused named trigger + Enter opened menu (`aria-expanded=true`); close click restored named trigger (`false`) |

Screenshots rendered/read: `/tmp/opencode/dashboard-fixture-mobile.png`, `dashboard-fixture-320-dark.png`, `dashboard-fixture-1440-dark.png`, `dashboard-fixture-390-light.png`. Full-page screenshots include fixed navbar placement and transient UI during capture; they are not visual-regression baselines. Fixture layout measurements and interactions are stronger evidence than the transient captures.

Fixture exception listener recorded no page exceptions during its initial save/server-switch matrix. Expected mocked 502/503 network failures appear in the browser console. Existing warnings include the navbar image missing `sizes` and unused font preload. One exploratory slider assertion timed out because the local value correctly reconciled before inspection; a response-based assertion verified value 101. Another assertion expected the server message through the generic fetcher; this exposed and led to fixing loss of HTTP error status/message with `liveFetcher`.

Computed browser token contrast: foreground/background 12.74:1 light, 15.65:1 dark; muted/card 5.16:1 light, 6.71:1 dark; warning/card 5.14:1 light, 9.43:1 dark. These are specific opaque token pairs, not a certification of all opacity composites, focus indicators, or the dashboard.

Production smoke server started successfully with `next start`; Next.js warned that this repository's standalone output should instead be deployed with the generated standalone server. This smoke run does not validate the production deployment entrypoint.

## Delivery gate for this bounded patch

- Hard-gate honesty/function PASS: no generated assets, statistics, fake production results, dead new controls, or service-contract changes; controlled interactions above exercised modified save/player behavior.
- Responsive gate PASS for the tested fixture: eight widths × two themes have no document overflow; live actions measured 44px; slider keyboard request exercised. Real soft keyboard and complete browser zoom remain unverified.
- State gate PASS: automated failed-save/dirty-baseline/pending/guild/stale/reconnect cases; browser error → retry → empty and save failure → retry recorded.
- Purpose gate PASS: every major decision and its trade-off is listed above; no new palette, decoration, card hierarchy, or motion system introduced.
- Identity/liveliness PASS for patch preservation: existing documented dials, palette, typography, and component hierarchy retained; short state transitions serve interaction feedback.
- Engineering gate PASS: tests, lint, typecheck, production build, and whitespace checks passed. Full WCAG/all-page/live-service acceptance is explicitly outside this verified subset and is not marked passed.

## Remaining work and next priorities

### Follow-up implementation after user approval

The user approved proceeding with all requested follow-ups. Implemented:

- `SaveBar`: portal-based floating island, dirty/pending active-panel visibility,
  persistent hidden-draft registration, duplicate-save guard, measured bottom
  clearance, focus restoration, 16px mobile insets and centered 760px desktop
  maximum. `SettingsPanelActive` is local React context in the existing shell,
  not a new application-wide action store. Seven consumers retain save ownership.
- AI history deletion moved outside the conditional save island; profile revert
  remains inside. AI refresh is disabled while a draft exists to avoid silently
  replacing it. JTC setup retains its pending lock.
- `ServerSwitcher`: replaced searchable Menu with Base UI Popover; fixed search
  above separately scrolling native-button list, readable title spacing and
  explicit loading/error/retry/empty states. Mobile retains a bottom sheet.
  Controlled Dialog replaces `window.confirm`, starts on Continue Editing, and
  restores the appropriate desktop/mobile trigger focus. Current tab is preserved.
- Removed the square negative-margin sticky footer causing clipped card corners.
  Select option radius now uses the control role token; dialog/sheet close copy
  is Korean. Music toggles now stack intentionally rather than incidental inline
  wrapping. Rounded avatar/switch shapes remain intentionally circular.
- Toasts render as normal-flow notices below the navbar, without scale/height
  stacking that obscured older messages. Each retains rounded-card, wrapping,
  close, swipe and opacity transitions. No empty toast action is mounted.
- `playerErrorMessage`: strips Discord custom-emoji markup in both live commands
  and search/play errors, retaining the real message; removed the unconditional,
  misleading bot-offline hint. Search/play duplicate submission is guarded.
- Confirmed functional bot defect: `hasControlPermission` destructured the
  instance method `member.permissions.has` and called it unbound. Real
  PermissionsBitField fixtures for managers, administrators and ordinary members
  reproduced the generic exception. Calling through the instance fixes it.
  This correction requires bot deployment as well as dashboard deployment.

Follow-up browser evidence (controlled local responses, not real playback):
100-server fixture opened in 112ms in one automation measurement, not a benchmark;
search selected the expected server. Cancel/Escape retained drafts; native
confirmation was not used. Mobile sheet selection opened the same confirmation.
Continue Editing received initial focus. Clean forms had zero islands; dirty
active forms had one; inactive dirty forms had zero while retaining registration.
Successful save removed the island and focused the panel H2. Final settled
measurements at all eight widths in both themes placed island bounds inside the
viewport with no document overflow: phone 16px side gaps, desktop 760px maximum;
bar heights were 108px mobile and 76px desktop. Popup/island/toast computed radius
was 16px for the latter two. Three notices measured separate y-ranges rather than
overlapping. Search error containing `<:error:...>` rendered the Korean message
without raw markup. No page exceptions during these interaction runs; expected
mock HTTP failures were logged. One exploratory measurement threw because HMR
removed the island; the corrected settled matrix passed. Screenshots at
`/tmp/opencode/dashboard-island-mobile.png` and
`/tmp/opencode/dashboard-switcher-desktop.png` were rendered and read, with the
usual fixed-chrome/transient-capture limitations.

Remaining: real Lavalink/Discord playback and service health, all seven panels'
end-to-end save/failure paths, real soft keyboard, complete zoom/contrast and
all-component rounding audit. Existing different role radii were not blindly
replaced. Original remaining priorities below are retained as historical triage;
the floating-island implementation item is superseded by this follow-up.

Final follow-up checks: dashboard Vitest 10 files / 56 tests passed; bot
playerWebResponder 6 regression tests passed; dashboard ESLint passed;
dependency-aware dashboard/bot typecheck passed; dashboard production build
passed with the temporary fixture removed; bot touched-file Prettier and
`git diff --check` passed. Permission regressions include real manager/admin/
member voice context and search/play/control validation reaching user-facing
preconditions instead of the generic exception.

Follow-up delivery gate (implemented scope): function/state PASS by confirmed
modal cancel/discard test, pending-save deduplication/focus test, hidden-draft
registration and browser interactions; responsive PASS by settled 16-case
viewport matrix; purpose/identity PASS by reuse of documented role radii,
opaque brand surfaces and action-only motion; engineering PASS by the commands
above. Live production playback and full all-page accessibility are not passed
or claimed. No deployment, production mutations, commit or push was performed.

1. Implement the unsaved-only floating bar across all seven panels following the existing [responsive plan](plans/2026-10-14-dashboard-responsive-ux.md). Preserve hidden drafts, history deletion, greeting partial failures, JTC setup locking, focus restoration, toast/menu layering, and measured bottom clearance.
2. Distinguish temporary Discord authorization/membership failures from missing servers and provide page-level recovery instead of 404/permission-denied presentation.
3. Surface playlist list/detail loading failures and retry; validate reorder/remove keyboard access and concurrent queue mutations with controlled fixtures.
4. Complete authenticated end-to-end testing for all settings tabs, bot-profile revert, JTC setup, greeting partial save, and server-switch warnings with an authorized test guild. No production mutations were made here.
5. Audit shared control focus/non-text contrast, 44px targets beyond the player, and real mobile keyboard/zoom behavior. Restore or locate the missing documented contrast script separately. Inspect the sidebar's `ring-ring/40` as an opacity-composite risk, not a measured failure.

Also investigate long-term SSE disconnection with no subsequent error/event, missing-artwork errors, search/play duplicate submissions, and list-scale performance before making broader claims. These were not repaired or benchmarked in this patch.
