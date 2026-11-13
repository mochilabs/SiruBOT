import { createContainer } from '@sirubot/utils';

/** 이미지 카드 응답 — 이미지는 첨부 파일, 아래에 위치·기준 캡션을 둬요. */
export function weatherImageView(filename: string, altText: string, caption: string) {
	return createContainer()
		.addMediaGalleryComponents((gallery) => gallery.addItems((item) => item.setURL(`attachment://${filename}`).setDescription(altText)))
		.addTextDisplayComponents((t) => t.setContent(caption));
}
