// Full slash-command demonstration exercising every Components V2 type.
// Requires discord.js (v14+) with the V2 display-component builders.

const {
  SlashCommandBuilder,
  MessageFlags,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  SectionBuilder,
  ChannelSelectMenuBuilder,
  ActionRowBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ButtonBuilder,
  ButtonStyle,
  FileBuilder,
  AttachmentBuilder,
} = require('discord.js');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('v2-components')
    .setDescription('Demonstrates all V2 components'),
  async execute(interaction, client) {
    const botAvatar = client.user.displayAvatarURL({ extension: 'png', size: 512 });

    // 1. TextDisplay
    const textDisplay = new TextDisplayBuilder().setContent('🔹 TextDisplay example');

    // 2. Separator
    const separator = new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small);

    // 3. Section + Thumbnail accessory
    const sectionThumb = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('📄 **Section Title**'),
        new TextDisplayBuilder().setContent('Description with thumbnail.'),
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder({ media: { url: botAvatar } }).setDescription('Bot avatar'),
      );

    // 4. Channel select menu in an ActionRow
    const selectMenu = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('channel_select').setPlaceholder('Select a channel…'),
    );

    // 5. Media gallery
    const mediaGallery = new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setDescription('Image 1').setURL('https://example.com/image1.png'),
      new MediaGalleryItemBuilder().setDescription('Image 2').setURL('https://example.com/image2.png'),
    );

    // 6. Sections with button accessories
    const sectionButtons = [
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('🔗 **Docs**'))
        .setButtonAccessory(
          new ButtonBuilder()
            .setLabel('Overview')
            .setURL('https://discord.com/developers/docs/components/overview')
            .setStyle(ButtonStyle.Link),
        ),
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('📑 **Reference**'))
        .setButtonAccessory(
          new ButtonBuilder()
            .setLabel('Types')
            .setURL('https://discord.com/developers/docs/components/reference#what-is-a-component-component-types')
            .setStyle(ButtonStyle.Link),
        ),
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('🚀 **Getting Started**'))
        .setButtonAccessory(
          new ButtonBuilder()
            .setLabel('Guide')
            .setURL('https://discord.com/developers/docs/components/using-message-components')
            .setStyle(ButtonStyle.Link),
        ),
    ];

    // 7. File attachment + File component
    const filePath = path.join(__dirname, '../../assets/embed-export.json');
    const attachment = new AttachmentBuilder(filePath).setName('embed-export.json');
    const fileComponent = new FileBuilder().setURL('attachment://embed-export.json');

    // 8. Container grouping everything
    const container = new ContainerBuilder()
      .setAccentColor(0x5865F2)
      .addMediaGalleryComponents(mediaGallery)
      .addSectionComponents(sectionThumb)
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(botAvatar)),
      )
      .addSectionComponents(...sectionButtons)
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('📝 **Fully composed with Components V2**'),
        new TextDisplayBuilder().setContent('- TextDisplay: static text'),
        new TextDisplayBuilder().setContent('- Section: grouped text/accessories'),
        new TextDisplayBuilder().setContent('- MediaGallery: images'),
        new TextDisplayBuilder().setContent('- Separator: content dividers'),
        new TextDisplayBuilder().setContent('- File: attachments'),
        new TextDisplayBuilder().setContent('- Button: actions/links'),
        new TextDisplayBuilder().setContent('- ChannelSelectMenu: choose channels'),
      )
      .addFileComponents(fileComponent);

    await interaction.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [textDisplay, separator, sectionThumb, selectMenu, container],
      files: [attachment],
    });
  },
};
