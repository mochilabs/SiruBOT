# Components V2 — Reference

Each display component with its builder, key methods, and caveats.

## Text Display

Markdown-formatted text that replaces the `content` field. Mentions notify users/roles — control via `allowedMentions`.

```js
const { TextDisplayBuilder } = require('discord.js');

const text = new TextDisplayBuilder()
  .setContent('**Bold**, *italic*, `code`, and :emoji: all work.');
```

- Can be used inside **modals** (see modal guide).
- Total text across all Text Displays ≤ 4000 chars.

## Section

1–3 Text Display components plus **one** accessory — either a Thumbnail **or** a Button, never both.

```js
const { SectionBuilder, ThumbnailBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Thumbnail accessory
const withThumb = new SectionBuilder()
  .addTextDisplayComponents(
    (t) => t.setContent('**Title**'),
    (t) => t.setContent('A description line.'),
  )
  .setThumbnailAccessory(
    (thumb) => thumb.setDescription('alt text').setURL('https://example.com/avatar.png'),
  );

// Button accessory
const withButton = new SectionBuilder()
  .addTextDisplayComponents((t) => t.setContent('**Docs**'))
  .setButtonAccessory(
    (b) => b.setCustomId('open_docs').setLabel('Open').setStyle(ButtonStyle.Primary),
  );
```

- `addTextDisplayComponents(...)` accepts builder instances or callbacks.
- No accessory wanted → use a plain `TextDisplay` instead.

## Thumbnail

Image accessory inside a Section. Supports **alt text** (`setDescription`) and **spoiler** (`setSpoiler(true)`).

```js
const { ThumbnailBuilder, AttachmentBuilder } = require('discord.js');

const file = new AttachmentBuilder('./avatar.png').setName('avatar.png');

const thumb = new ThumbnailBuilder({ media: { url: 'attachment://avatar.png' } })
  .setDescription('User avatar');
```

- URL can be `attachment://<name>` or any external URL.
- If you use an attachment, include it in `files: [...]` and reference it here.

## Media Gallery

Grid of up to **10** media items. Each item supports `setDescription` (alt text) and `setSpoiler(true)`.

```js
const { MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');

const gallery = new MediaGalleryBuilder().addItems(
  new MediaGalleryItemBuilder()
    .setDescription('First image')
    .setURL('attachment://a.png'),
  new MediaGalleryItemBuilder()
    .setDescription('Blurred image')
    .setURL('https://i.imgur.com/AfFp7pu.png')
    .setSpoiler(true),
);
```

## File

Displays a single uploaded file in the message body. **No** alt text (unlike Thumbnail/Gallery), but supports `setSpoiler(true)`.

```js
const { FileBuilder, AttachmentBuilder } = require('discord.js');

const file = new AttachmentBuilder('./data.json').setName('data.json');
const fileComponent = new FileBuilder().setURL('attachment://data.json');

// send with: files: [file]
```

- Multiple File components → multiple files in one message.
- The referenced attachment must be in `files`.

## Separator

Vertical padding plus optional divider. Two spacing sizes and a divider toggle (default `true`).

```js
const { SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');

const gap = new SeparatorBuilder()
  .setDivider(false)          // no line drawn
  .setSpacing(SeparatorSpacingSize.Large);
```

- `SeparatorSpacingSize.Small` | `.Large`.
- A message containing *only* Separators shows no visible content.

## Container

Groups child components inside a rounded box, optional accent color (left bar) and spoiler (blurs all content).

```js
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, UserSelectMenuBuilder } = require('discord.js');

const box = new ContainerBuilder()
  .setAccentColor(0x0099ff)
  .setSpoiler(true)
  .addTextDisplayComponents((t) => t.setContent('Inside a container'))
  .addActionRowComponents((row) =>
    row.setComponents(new UserSelectMenuBuilder().setCustomId('pick').setPlaceholder('Select users')),
  )
  .addSeparatorComponents((s) => s);
```

- Child-adding methods: `addTextDisplayComponents`, `addSectionComponents`, `addSeparatorComponents`, `addMediaGalleryComponents`, `addFileComponents`, `addActionRowComponents`.
- No accent color → left bar matches background (unlike embeds).

## Button

Link or interaction control; usable as a Section accessory or inside an Action Row.

```js
const { ButtonBuilder, ButtonStyle } = require('discord.js');

const link = new ButtonBuilder()
  .setLabel('Docs')
  .setURL('https://discord.com/developers/docs/components/overview')
  .setStyle(ButtonStyle.Link);

const action = new ButtonBuilder()
  .setCustomId('do_thing')
  .setLabel('Do Thing')
  .setStyle(ButtonStyle.Primary);
```

- Link buttons use `.setURL()`; interaction buttons use `.setCustomId()` + `.setStyle()`.

## Select Menus

Interactive dropdowns. Variants: `ChannelSelectMenuBuilder`, `UserSelectMenuBuilder`, `RoleSelectMenuBuilder`, `StringSelectMenuBuilder`, `MentionableSelectMenuBuilder`.

```js
const { ChannelSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

const menu = new ChannelSelectMenuBuilder()
  .setCustomId('channel_select')
  .setPlaceholder('Select a channel…');

const row = new ActionRowBuilder().addComponents(menu);
```

- Select menus belong in an `ActionRow` (or a Container's `addActionRowComponents`).
