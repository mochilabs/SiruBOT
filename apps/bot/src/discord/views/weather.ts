import { createContainer } from '@sirubot/utils';

/** 이미지 카드 응답 — 이미지는 첨부 파일이고 별도 설명 텍스트는 붙이지 않아요(대체 텍스트만 접근성용으로 둬요). */
export function weatherImageView(filename: string, altText: string) {
	return createContainer().addMediaGalleryComponents((gallery) =>
		gallery.addItems((item) => item.setURL(`attachment://${filename}`).setDescription(altText))
	);
}
