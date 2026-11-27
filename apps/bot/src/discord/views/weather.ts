import { createContainer } from '@sirubot/utils';

export function weatherImageView(filename: string, altText: string) {
	return createContainer().addMediaGalleryComponents((gallery) =>
		gallery.addItems((item) => item.setURL(`attachment://${filename}`).setDescription(altText))
	);
}
