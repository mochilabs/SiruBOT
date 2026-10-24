---
name: component-view
description: Create or modify SiruBOT Components V2 views (playback notification, controller, queue, settings, error) including layout, buttons/selects, and Korean copy.
---

# Component Views (Discord Components V2)

All views live as functions in `apps/bot/src/modules/<audio|general>/view/`. Never write new views with legacy Embeds (`ExtendedEmbedBuilder`).

1. Start with helpers from `@sirubot/utils`: `createContainer()` (auto DEFAULT_COLOR accent), then `addSeparator(container)` and `createThumbnail(url)` — prefer these over `new`. Thumbnail+text combo: follow the `addTextWithThumbnail` pattern from `view/play.ts` (SectionBuilder + setThumbnailAccessory; TextDisplay alone if no URL).
2. Assembly order: TextDisplay/Section → ActionRow (buttons/selects) → Separator → footer. Put buttons/selects inside `container.addActionRowComponents()`. Always send with `flags: [MessageFlags.IsComponentsV2]` — omitting it breaks rendering; check the call site too.
3. customId: controller-family IDs use the `controller:` prefix + `wrapPrefix` helper (`view/controller.ts`). New handler IDs must not collide with existing `parse()` in `interaction-handlers/*.ts`; state whether the handler can parse it.
4. State: derive button disabled/emoji/labels from player state (paused, repeatMode, queue length, page bounds). Pagination: 5-item chunks (`QUEUE_PAGE_CHUNK_SIZE = 5`) + the `queuePage` clamping pattern. Select option labels are capped at 100 chars — truncate via `formatTrack(..., { titleLength: { maxLength: 80 } })`.
5. Text: Korean; keep existing tone (`-#` subtext, `###` headings, emoji like 🎵📄🔇). Reuse `formatTrack` / `formatTime` / `formatTimeToKorean` / `getRequesterText` / `emojiProgressBar` / `volumeToEmoji` — don't create new formatters. One-line errors: `errorView(message)`.
6. Footer: playback views attach the `buildFooterSegments(player, volume)` pattern (playing server, volume, version).

Deliver: complete view function code + a table of required flags/customIds at each call site (handler/command). Flag Discord limits up front if hit (5 buttons per row, 25 select options, 4000 chars text).