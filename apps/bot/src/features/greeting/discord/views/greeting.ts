import { createContainer, createSeparator, createThumbnail, type GreetingKind } from '@sirubot/utils';
import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, SeparatorBuilder, TextDisplayBuilder } from 'discord.js';

/** 인사 메시지를 이루는 최상위 컴포넌트 조각 — 컨테이너에 담거나 목록으로 그대로 보내요 */
export type GreetingMessagePart = TextDisplayBuilder | SectionBuilder | MediaGalleryBuilder | SeparatorBuilder;

/** 조각 목록을 컨테이너 1개로 묶어요 — 조각 종류마다 컨테이너 add 메서드가 갈려요 */
function partsToContainer(parts: GreetingMessagePart[], accentColor: string | null): ContainerBuilder {
	const container = createContainer(accentColor);
	for (const part of parts) {
		if (part instanceof TextDisplayBuilder) container.addTextDisplayComponents(part);
		else if (part instanceof SectionBuilder) container.addSectionComponents(part);
		else if (part instanceof MediaGalleryBuilder) container.addMediaGalleryComponents(part);
		else if (part instanceof SeparatorBuilder) container.addSeparatorComponents(part);
	}
	return container;
}

export type GreetingViewInput = {
	kind: GreetingKind;
	isTest: boolean;
	content: string;
	/** 카드 이미지 첨부 파일 이름 — 이미지가 없으면 null */
	imageFilename: string | null;
	avatarUrl: string | null;
	layout: 'container' | 'components';
	accentColor: string | null;
};

/** 본문·이미지를 컴포넌트 조각으로 쌓고, 레이아웃에 따라 컨테이너에 담거나 목록으로 돌려줘요. */
export function greetingComponents(input: GreetingViewInput): (ContainerBuilder | GreetingMessagePart)[] {
	const { kind, isTest, content, imageFilename, avatarUrl, layout, accentColor } = input;
	const parts: GreetingMessagePart[] = [];
	if (isTest) {
		parts.push(new TextDisplayBuilder().setContent(`-# ${kind === 'welcome' ? '확인용 환영 메시지예요' : '확인용 작별 메시지예요'}`));
		parts.push(createSeparator());
	}
	if (content.trim().length > 0) {
		if (!imageFilename && avatarUrl) {
			const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
			section.setThumbnailAccessory(createThumbnail(avatarUrl));
			parts.push(section);
		} else {
			parts.push(new TextDisplayBuilder().setContent(content));
		}
	}
	if (imageFilename) {
		parts.push(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${imageFilename}`)));
	}
	// 강조색은 컨테이너 전용 속성이라 'components' 레이아웃에서는 들어가지 않아요.
	return layout === 'container' ? [partsToContainer(parts, accentColor)] : parts;
}
