import { addSeparator, createContainer, createThumbnail, emoji } from '@sirubot/utils';
import { MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, TextDisplayBuilder, type Message } from 'discord.js';

const QUOTE_SNIPPET_MAX = 500;

function quoteSection(source: Message): SectionBuilder {
	const content = source.content.trim();
	const snippet = content.length > QUOTE_SNIPPET_MAX ? `${content.slice(0, QUOTE_SNIPPET_MAX - 1)}…` : content;
	const postedAt = Math.floor(source.createdTimestamp / 1_000);
	return new SectionBuilder()
		.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`**${source.author.username}** · <t:${postedAt}:R>`),
			new TextDisplayBuilder().setContent(content.length > 0 ? snippet : '*(미디어만 있는 메시지)*'),
			new TextDisplayBuilder().setContent(`-# ${source.channel}`)
		)
		.setThumbnailAccessory(createThumbnail(source.author.displayAvatarURL({ size: 256 })));
}

export function messageQuoteView(sources: Message[], images: string[]) {
	const container = createContainer();
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${emoji('link')} 메시지 인용`));
	sources.forEach((source, index) => {
		if (index > 0) addSeparator(container);
		container.addSectionComponents(quoteSection(source));
	});
	if (images.length > 0) {
		const gallery = new MediaGalleryBuilder();
		for (const url of images) gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
		container.addMediaGalleryComponents(gallery);
	}
	return container;
}
