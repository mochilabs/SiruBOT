import { createContainer, createSeparator, createThumbnail, type GreetingKind } from '@sirubot/utils';
import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SectionBuilder, SeparatorBuilder, TextDisplayBuilder } from 'discord.js';

export type GreetingMessagePart = TextDisplayBuilder | SectionBuilder | MediaGalleryBuilder | SeparatorBuilder;

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
	imageFilename: string | null;
	avatarUrl: string | null;
	layout: 'container' | 'components';
	accentColor: string | null;
};

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
	return layout === 'container' ? [partsToContainer(parts, accentColor)] : parts;
}
