# SiruBOT Dashboard Implementation Memo

## Scope

- Route transition for all pages through App Router layout
- Ranking chart refresh with icon cleanup and motion behavior
- Shard dashboard live pulse and dashboard texture overlay
- New invite flow pages:
  - `/invite`
  - `/invite/redirect`

## Technical Plan

1. Add a client `PageTransition` wrapper that uses `AnimatePresence`.
2. Keep global styling aligned to the project palette and remove glass-like blur cards.
3. Rebuild ranking list component as motion-aware client component.
4. Add pagination component with strong visual feedback and accessible labels.
5. Replace emoji-based indicators with Lucide icons on key pages.
6. Add invite CTA route and post-invite redirect route for setup guidance.

## Risk Notes

- Existing code has mixed legacy styles and broken Korean strings in some files.
- Partial rewrites are preferred over tiny diffs in heavily corrupted files.
- Route transition in App Router should key by pathname to ensure animation consistency.

## Validation Checklist

- `yarn workspace @sirubot/dashboard lint`
- `yarn workspace @sirubot/dashboard typecheck`
- Manual navigation:
  - `/`, `/track`, `/shards`, `/servers`, `/invite`
- Pagination transition on `/track?page=2`
- Pulse visibility on shard status badges

