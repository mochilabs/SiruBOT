import { createContainer, createThumbnail } from '@sirubot/utils';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ContainerBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	SectionBuilder,
	TextDisplayBuilder
} from 'discord.js';
import type { StarboardSource } from '../../application/starboardService.ts';

const BODY_MAX = 1_500;
const STAR_ACCENT_COLOR = '#FFAC33';

export function starboardCard(source: StarboardSource, count: number, emojiMarkup: string): ContainerBuilder {
	const container = createContainer(STAR_ACCENT_COLOR);

	const header = [
		new TextDisplayBuilder().setContent(`**${source.authorName}**`),
		new TextDisplayBuilder().setContent(`-# ${emojiMarkup} **${count}** · <#${source.channelId}>`)
	];
	if (source.authorAvatarUrl) {
		container.addSectionComponents(
			new SectionBuilder().addTextDisplayComponents(...header).setThumbnailAccessory(createThumbnail(source.authorAvatarUrl))
		);
	} else {
		container.addTextDisplayComponents(...header);
	}

	const body = source.content.trim();
	if (body.length > 0) {
		const text = body.length > BODY_MAX ? `${body.slice(0, BODY_MAX - 1)}…` : body;
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
	}
	if (source.firstImageUrl) {
		container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(source.firstImageUrl)));
	}

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setLabel('원문 보기').setStyle(ButtonStyle.Link).setURL(source.jumpUrl)
		)
	);
	return container;
}
