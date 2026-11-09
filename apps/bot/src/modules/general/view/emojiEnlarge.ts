import { createContainer } from '@sirubot/utils';
import { MediaGalleryBuilder, MediaGalleryItemBuilder } from 'discord.js';

export function emojiEnlargeView(urls: string[]) {
	const gallery = new MediaGalleryBuilder();
	for (const url of urls) gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
	return createContainer().addMediaGalleryComponents(gallery);
}
