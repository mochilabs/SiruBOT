import { CUSTOM_COMMAND_ACCENT_COLOR_VALUES, createContainer, createThumbnail, type CustomCommandDesign } from '@sirubot/utils';
import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, SeparatorBuilder, TextDisplayBuilder } from 'discord.js';

export function customCommandDesignView(design: CustomCommandDesign, substitute: (text: string) => string): ContainerBuilder {
	const container = new ContainerBuilder();
	container.setAccentColor(CUSTOM_COMMAND_ACCENT_COLOR_VALUES[design.accentColor ?? 'blue']);
	for (const item of design.items) {
		switch (item.kind) {
			case 'text':
				container.addTextDisplayComponents(new TextDisplayBuilder().setContent(substitute(item.content)));
				break;
			case 'separator':
				container.addSeparatorComponents(new SeparatorBuilder());
				break;
			case 'section': {
				const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(substitute(item.content)));
				section.setThumbnailAccessory(createThumbnail(item.thumbnailUrl));
				container.addSectionComponents(section);
				break;
			}
			case 'media': {
				const gallery = new MediaGalleryBuilder();
				for (const url of item.urls) gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
				container.addMediaGalleryComponents(gallery);
				break;
			}
		}
	}
	return container;
}

export function customCommandListView(state: { hasCommands: boolean }, lines: string[]): ContainerBuilder {
	const container = createContainer();
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 커스텀 명령어'));

	if (!state.hasCommands) {
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent('아직 등록된 커스텀 명령어가 없어요.\n-# 서버 관리자가 대시보드에서 만들 수 있어요.')
		);
		return container;
	}
	if (lines.length === 0) {
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent('이 서버의 커스텀 명령어는 슬래시로 등록되어 있어요.\n-# 슬래시 명령어 목록에서 확인해 주세요.')
		);
	} else {
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
	}
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# 생성·수정·삭제는 대시보드에서 관리해요.'));
	return container;
}
