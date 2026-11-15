---
name: discord-components-v2
description: "Build rich Discord.js message layouts with Discord Components V2 (display components) — TextDisplay, Section, Thumbnail, MediaGallery, File, Separator, Container, Buttons, Select Menus. Use when creating or editing V2 component messages, opting into MessageFlags.IsComponentsV2, or converting embeds to display components."
allowed-tools: Read Write Edit Glob Grep Bash
---

# Discord Components V2

Discord **Components V2** (a.k.a. **display components**) are UI building blocks for messages: layout and content elements that replace embeds and raw `content` for rich, interactive messages. They are the modern replacement for embeds when you need structured layouts, media galleries, and file display.

> **Key gate:** A message uses display components only when it carries the `IsComponentsV2` message flag (`MessageFlags.IsComponentsV2`). Without this flag, the components are sent as the legacy message-component system (buttons/select menus alongside `content`).

## When to use this skill

- Creating a message with display components (`TextDisplay`, `Section`, `MediaGallery`, `Container`, etc.).
- Opting a message into the V2 system via `flags: MessageFlags.IsComponentsV2`.
- Converting an embed-based message to display components.
- Adding interactive elements (buttons, select menus) inside a V2 message.

## Hard constraints (from Discord)

Opting into `IsComponentsV2` imposes these rules — violations are silently rejected or render wrong:

- **Cannot** send `content`, `poll`, `embeds`, or `stickers` in the same payload.
- **Cannot** opt out of display components when *editing* a message that already used them.
- **Can** opt in when editing while explicitly setting `content`, `poll`, `embeds`, and `stickers` to `null`.
- Messages may have up to **40** total components (nested components count toward this).
- Text across **all** `TextDisplay` components must not exceed **4000** characters.
- Every attached file **must** be explicitly referenced by a component (`Thumbnail`, `MediaGallery`, or `File`). Unreferenced attachments are dropped.

## Component reference

Detailed examples, builder methods, and caveats per component live in [`references/components.md`](references/components.md).

| Component | Builder | Purpose |
|-----------|---------|---------|
| Text Display | `TextDisplayBuilder` | Markdown-formatted text; replaces `content`. |
| Section | `SectionBuilder` | 1–3 text displays + one accessory (thumbnail **or** button). |
| Thumbnail | `ThumbnailBuilder` | Image accessory inside a Section (alt text, spoiler). |
| Media Gallery | `MediaGalleryBuilder` / `MediaGalleryItemBuilder` | Grid of up to 10 media items. |
| File | `FileBuilder` | Displays a single uploaded file in the message body. |
| Separator | `SeparatorBuilder` | Vertical padding and optional divider. |
| Container | `ContainerBuilder` | Rounded box grouping child components, optional accent color/spoiler. |
| Button | `ButtonBuilder` | Link or interaction accessory/control. |
| Select Menu | `ChannelSelectMenuBuilder` etc. | Interactive dropdowns (channel/user/role/string/mentionable). |

## Usage pattern

1. Import the needed builders plus `MessageFlags` from `discord.js`.
2. Build each component with its builder.
3. Group related components inside a `ContainerBuilder`.
4. Send with `components: [...]`, `files: [...]`, and `flags: MessageFlags.IsComponentsV2`.

Minimal working message:

```js
const { TextDisplayBuilder, MessageFlags } = require('discord.js');

const text = new TextDisplayBuilder()
  .setContent('Hello **world**! Markdown works here.');

await channel.send({
  components: [text],
  flags: MessageFlags.IsComponentsV2,
});
```

## Full slash-command demonstration

A complete command exercising every component type is in [`references/full-example.js`](references/full-example.js).

## Component `id` (vs `custom_id`)

All display components accept an optional `id` field (a 32-bit integer) used to identify them in later interaction responses — do **not** confuse it with the `custom_id` on interactive components. Discord auto-populates `id` sequentially from `1` when omitted; `0` means empty. If you need to find/replace a specific component later, set `id` explicitly.

## Best practices

- Group related items in `Container`s for structure; use `Separator`s for readability.
- Keep text short (mobile users); mention users/roles carefully — text displays **will** notify, so control with `allowedMentions`.
- Reference attached files with `attachment://<name>`; set the `AttachmentBuilder` name to match.
- Use `setDescription` for alt text on `Thumbnail` and `MediaGalleryItem` (accessibility).
- Ensure all URLs are valid; buttons either link (URL) or carry a `custom_id` for interaction handling.

## Resources

- [Discord Developer Docs — Components Overview](https://discord.com/developers/docs/components/overview)
- [Component Types Reference](https://discord.com/developers/docs/components/reference#what-is-a-component-component-types)
- [Using Message Components](https://discord.com/developers/docs/components/using-message-components)
- [discord.js Guide — Display Components](https://discordjs.guide/popular-topics/display-components)
