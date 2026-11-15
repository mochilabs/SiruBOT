import { createContainer } from '@sirubot/utils';
import { MediaGalleryBuilder, MediaGalleryItemBuilder } from 'discord.js';

export function serverInfoView(lines: string[], iconUrl: string | null, bannerUrl: string | null) {
	const containerComponent = createContainer();
	const content = lines.join('\n');
	if (iconUrl) {
		containerComponent.addSectionComponents((s) =>
			s.addTextDisplayComponents((t) => t.setContent(content)).setThumbnailAccessory((t) => t.setURL(iconUrl))
		);
	} else {
		containerComponent.addTextDisplayComponents((t) => t.setContent(content));
	}
	if (bannerUrl) {
		containerComponent.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerUrl)));
	}
	return containerComponent;
}
