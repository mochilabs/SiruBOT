import { CUSTOM_COMMAND_ACCENT_COLOR_VALUES, DEFAULT_COLOR, createThumbnail, type CustomCommandDesign } from '@sirubot/utils';
import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, SeparatorBuilder, TextDisplayBuilder } from 'discord.js';

/** CV2 디자인 → 컨테이너 컴포넌트. 텍스트의 인자 치환은 호출부(인터프리터)가 넘겨요. */
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

/**
 * `!도움말` 목록 — 접두사 명령어 줄(`lines`)이 있으면 나열하고, 등록된 명령어가 없거나
 * 전부 슬래시면 그에 맞는 안내 문구를 보여줘요.
 */
export function customCommandListView(state: { hasCommands: boolean }, lines: string[]): ContainerBuilder {
	const container = new ContainerBuilder().setAccentColor(DEFAULT_COLOR);
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
