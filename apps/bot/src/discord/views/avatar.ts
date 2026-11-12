import { emoji, createContainer } from '@sirubot/utils';
import { MediaGalleryBuilder, MediaGalleryItemBuilder } from 'discord.js';

export function avatarView(label: string, avatarUrl: string) {
	return createContainer()
		.addTextDisplayComponents((t) => t.setContent(`### ${emoji('frame')} ${label}`))
		.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(avatarUrl)));
}
