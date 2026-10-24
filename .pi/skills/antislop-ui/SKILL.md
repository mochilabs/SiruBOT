---
name: antislop-ui
description: "Anti-slop UI filter: purpose-test every technique, catch the AI-default design patterns, and enforce contrast/mobile/accessibility gates. Load whenever building or editing any interface."
allowed-tools: Read Write Edit Glob Grep Bash(python3 *)
---
# antislop-ui

A filter, not a style guide. It bans no visual technique; it bans technique without purpose. Before any visual decision, answer: **what does this serve?** If the answer is a hierarchy, identity, or readability goal, keep it and write the reason down. If the only answer is "it looks AI" or "it looks safe", cut or rework it. Done test: if the logo and product name were swapped out, would the design still feel unique? If not, start over. The result must be alive and specific, not sterile: removing slop leaves a void, and liveliness must be added (identity, palette, typography, rhythm), never assumed. Also: every interactive element works or does not exist; every section exists because the content needs it; claims, testimonials, and statistics are real or not shown; the UI holds in empty/loading/error states, every theme, every breakpoint, and keyboard-only use.

## AI slop tells (audit scan, not a ban list; a pattern is fine if it passes the purpose test; slop is many together with no reason)

- Trend-stacking: glassmorphism + mesh gradient + glow + monospace + background grid combined for no reason
- Generic blue-purple/blue-cyan/purple-pink gradients, full-page glow, neon/pastel defaults, blurred radial orbs
- Skeleton placeholder bars used as the "product screenshot" in the hero
- Monotonous template rhythm: hero, subtitle, 2 CTAs, screenshot, feature grid, testimonials, FAQ, CTA, footer
- Copy-paste feature cards: identical size, icon, layout, padding
- Bento grid used as the default "app-like" section for no content reason
- Uniform spacing: identical padding/margin/gaps across every section; alternating background color as the only variation
- Template fade-up/fade-in/floating/bounce animations on everything; endless pulse loops
- Fake terminal window as the hero visual for a product that is not a CLI
- "Trusted by" logo bar with generic logos below the hero; fabricated testimonials/statistics
- 3-tier pricing with the middle tier always highlighted by a capsule "Most Popular" badge
- Dark mode by default just to look "tech", no branding reason
- One accent color on buttons, icons, badges, links, lines, backgrounds, and glows at once
- Decorative tells: sparkle/star/lightning/robot icons, uniform thin-stroke icon library, colored left stripe on cards, arrows on every button, "AI Powered" pill badges, eyebrow pill above the H1, glowing status dots marking nothing, wide-tracked uppercase labels, emoji in UI text
- Default dashboard shell (sidebar + stat cards + chart + table), invented stat numbers, filler activity feeds, charts without a question
- Em dash in any UI text: use comma, period, colon, or parentheses instead

## Accessibility (hard rules)

- WCAG AA contrast: 4.5:1 normal text, 3:1 large text (18px+) and non-text UI (component boundaries, focus indicators, icons, chart segments). Never eyeball a pairing; the eye overestimates grey-on-grey (#555555 on black is 2.8:1, FAIL). Compute: `python3 .pi/skills/antislop-ui/contrast-check.py "<fg>" "<bg>"`. Test the worst spot, not the best, and the whole area text passes over (text over photos/gradients needs a scrim).
- Keyboard: everything reachable and operable (Tab order follows visual order, Enter/Space activates, Escape closes dialogs). Visible focus indicator (3:1) on every interactive element in every theme; never `outline: none` without a replacement. No hover-only interactions; pair every color-only status signal with text or an icon.
- Text must survive 200% zoom without clipping; focused mobile inputs must scroll above the on-screen keyboard.

## Mobile reflow (hard rules)

Mobile is a different layout, not the desktop layout shrunk. Re-stack, rescale, and re-order with intent:
- Columns collapse and stack; nothing collides or clips.
- Own mobile scale for type (`clamp()` or smaller step), padding (~half of desktop), gaps; no `100vh` slabs, no desktop-sized elements.
- No horizontal overflow at any width: reflow or scroll-contain the offender (tables, code blocks, images `max-width: 100%`, `min-width: 0` children).
- Tap targets ≥ 44 x 44px with gaps between them; nav reflows to a mobile pattern (bottom nav or labeled menu); fixed bars never cover content (safe-area insets, scroll padding).
- Breakpoints sit where the content breaks, not on device widths; verify the full width range, not two sample points.

## Delivery gate (before delivering any UI)

- Every technique has a written purpose (hierarchy/identity/readability) or is cut.
- Contrast computed, not guessed (run contrast-check.py on every pairing).
- Layout holds at 320px: no horizontal overflow, no collisions, tap targets ≥ 44px.
- No two adjacent sections with identical composition.
- Every interactive element works; empty/loading/error states exist; all shipped themes verified; keyboard-only use passes.

Vendored/distilled from https://github.com/miqdadbadjuber/anti-slop v3.2.20