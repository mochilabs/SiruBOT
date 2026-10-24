---
name: ai-slop-cleaner
description: "Regression-safe, deletion-first cleanup of AI-generated code slop (duplicates, dead code, needless abstraction) plus code comment hygiene. Load on deslop/antislop/cleanup requests or a --review read-only pass."
---
# AI Slop Cleaner

Bounded cleanup of working-but-bloated AI code without drifting scope or changing intended behavior. Goal: simplification, not new features.

## When to use
- User says `deslop`, `anti-slop`, `AI slop`, or asks to clean noisy/repetitive/over-abstracted code
- Follow-up work left duplicate logic, dead code, wrapper layers, boundary leaks, or weak regression coverage
- Reviewer-only anti-slop pass via `--review`

Skip for: new-feature builds, broad redesigns, generic refactors with no simplification intent, or behavior too unclear to protect with tests or a concrete verification plan.

## Posture
- Preserve behavior unless the user explicitly asks for behavior changes.
- Lock behavior with the narrowest regression tests first, before editing.
- Write a cleanup plan before touching code.
- Prefer deletion over addition; reuse existing utilities/patterns; no new dependencies unless requested.
- Keep diffs small, reversible, and smell-focused.
- Treat new instructions as local scope updates; keep earlier non-conflicting constraints.

## Scope fencing
Bound the pass to an explicit file list or changed-file scope (e.g. a prior session's `git diff --name-only`). Keep the same regression-safe workflow even for a short list. Never silently expand a changed-file scope into broader cleanup unless the user asks.

## Workflow
1. **Protect behavior first**: identify what must stay the same; add/run the narrowest regression tests; if tests cannot come first, record the verification plan explicitly.
2. **Plan before code**: list the concrete smells to remove; order from safest deletion to riskier consolidation.
3. **Classify slop**: duplication (copy-paste branches, redundant helpers), dead code (unused/unreachable code, stale flags, debug leftovers), needless abstraction (pass-through wrappers, speculative indirection, single-use layers), boundary violations (hidden coupling, misplaced responsibilities, wrong-layer imports/side effects), missing tests.
4. **One smell-focused pass at a time**: dead code, then duplicates, then naming/error handling, then test reinforcement. Re-run targeted verification after each pass. Never bundle unrelated refactors into one edit set.
5. **Quality gates**: keep regression tests green; run the relevant lint, typecheck, and unit/integration tests for the touched area (`yarn lint` / `yarn typecheck` / `yarn test`); if a gate fails, fix or back out the risky cleanup instead of forcing it through.
6. **Report**: changed files, simplifications made, behavior lock / verification run, remaining risks.

## Review mode (`--review`)
Reviewer-only pass over drafted cleanup. Do not start by editing files. Inspect the cleanup plan, changed files, and regression coverage for: leftover dead code or unused exports, unconsolidated duplicate logic, needless wrappers still blurring boundaries, missing/weak tests, and cleanup that changed behavior without intent. Produce a reviewer verdict with required follow-ups; hand needed changes back to a separate writer pass. The same pass must never both write and self-approve high-impact cleanup.

## Code comment hygiene
On any comment-only pass, modify comments only: never touch executable code, identifiers, imports, formatting, whitespace, or logic. When in doubt, leave the code untouched.

Delete comments that:
- restate the code (`// User class` above `class User {}`, signature-echoing JSDoc)
- narrate the obvious step by step (`// Step 1: Validate input`, `// First...`, `// Next...`, end markers like `} // end if`)
- are decorative: banner separators, ALL-CAPS/box-drawn headers, emoji labels, empty labels (`// Main logic`), vague TODOs that name no actionable task
- pad a one-line fact into a paragraph (issue numbers, version history, reasoning chains), or comment every trivial line instead of one concise comment per logical block

Keep comments that carry contracts, invariants, or the why: business intent, architectural decisions, security considerations, performance trade-offs, concurrency behavior, protocol/API details, workarounds, edge cases, licensing. Keep a TODO only when it names a specific actionable task. Keep comments short, natural, sentence case; explain why, not what. Value is not length: a kept comment is one or two lines, never a paragraph.

## Good fits
- `deslop this module: too many wrappers, duplicate helpers, and dead code`
- `cleanup the AI slop in src/auth and tighten boundaries without changing behavior`

Bad fits: `refactor auth to support SSO`, `clean up formatting`.