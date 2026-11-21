import { createContainer, createThumbnail } from '@sirubot/utils';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	type ContainerBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	SectionBuilder,
	TextDisplayBuilder
} from 'discord.js';
import type { StarboardSource } from '../../application/starboardService.ts';

/** 본문 표시 상한 — Components V2 텍스트 합계 4000자 안에서 넉넉하게 잡아요 */
const BODY_MAX = 1_500;
/** 스타보드 카드 강조색 — 별의 노란색 */
const STAR_ACCENT_COLOR = '#FFAC33';

/**
 * 스타보드 카드 — 작성자(프사 썸네일)와 별 수, 본문, 첫 이미지, 원문 링크 버튼.
 * 별 수만 바뀌어도 같은 함수로 다시 그려 수정해요.
 */
export function starboardCard(source: StarboardSource, count: number, emojiMarkup: string): ContainerBuilder {
	const container = createContainer(STAR_ACCENT_COLOR);

	const header = [
		new TextDisplayBuilder().setContent(`**${source.authorName}**`),
		new TextDisplayBuilder().setContent(`-# ${emojiMarkup} **${count}** · <#${source.channelId}>`)
	];
	if (source.authorAvatarUrl) {
		container.addSectionComponents(
			new SectionBuilder().addTextDisplayComponents(...header).setThumbnailAccessory(createThumbnail(source.authorAvatarUrl))
		);
	} else {
		container.addTextDisplayComponents(...header);
	}

	const body = source.content.trim();
	if (body.length > 0) {
		const text = body.length > BODY_MAX ? `${body.slice(0, BODY_MAX - 1)}…` : body;
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
	}
	if (source.firstImageUrl) {
		container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(source.firstImageUrl)));
	}

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setLabel('원문 보기').setStyle(ButtonStyle.Link).setURL(source.jumpUrl)
		)
	);
	return container;
}
