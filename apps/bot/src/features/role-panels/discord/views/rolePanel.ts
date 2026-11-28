import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder
} from 'discord.js';
import { createContainer, createThumbnail, emoji } from '@sirubot/utils';
import { isValidRolePanelEmoji } from '@sirubot/utils/rolePanel';
import { rolePanelId } from '../customIds.ts';
import type { RolePanel, RolePanelButton } from '@sirubot/prisma';

const BUTTON_STYLES: Record<string, ButtonStyle> = {
	secondary: ButtonStyle.Secondary,
	primary: ButtonStyle.Primary,
	success: ButtonStyle.Success,
	danger: ButtonStyle.Danger
};

const BUTTONS_PER_ROW = 5;

export function rolePanelView(panel: RolePanel, buttons: RolePanelButton[]): { flags: number; components: [ContainerBuilder] } {
	const container = createContainer(panel.accentColor);
	const separator = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);
	const imageUrl = panel.imageUrl;
	const useThumbnail = Boolean(imageUrl) && panel.imageLayout === 'thumbnail';
	const galleryPosition =
		imageUrl && !useThumbnail ? (panel.imagePosition === 'top' || panel.imagePosition === 'bottom' ? panel.imagePosition : 'middle') : null;
	const addGallery = () => {
		container.addSeparatorComponents(separator());
		container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl!)));
	};

	const titleText = new TextDisplayBuilder().setContent(`### ${emoji('ticket')} ${panel.title}`);
	if (galleryPosition === 'top') {
		container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl!)));
		container.addSeparatorComponents(separator());
	}
	if (useThumbnail) {
		// 섬네일은 Section의 액세서리라서 제목·안내문을 같은 Section에 넣어요 (Section은 텍스트 1~3개).
		const section = new SectionBuilder().addTextDisplayComponents(titleText);
		if (panel.description) section.addTextDisplayComponents(new TextDisplayBuilder().setContent(panel.description));
		container.addSectionComponents(section.setThumbnailAccessory(createThumbnail(imageUrl!)));
	} else {
		container.addTextDisplayComponents(titleText);
		if (panel.description) {
			container.addSeparatorComponents(separator());
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(panel.description));
		}
		if (galleryPosition === 'middle') addGallery();
	}

	// 반응 모드 — 버튼 대신 "이모지 라벨" 목록을 보여주고, 봇이 같은 이모지로 반응을 달아 둬요.
	if (panel.mode === 'reaction') {
		container.addSeparatorComponents(separator());
		const lines = buttons.map((button) => `${button.emoji ?? ''} **${button.label}**`.trim());
		lines.push('', '-# 이모지를 누르면 역할을 받고, 다시 누르면 해제돼요.');
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
		if (galleryPosition === 'bottom') addGallery();
		return { flags: MessageFlags.IsComponentsV2, components: [container] };
	}

	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
		const chunk = buttons.slice(i, i + BUTTONS_PER_ROW);
		const row = new ActionRowBuilder<ButtonBuilder>();
		for (const button of chunk) {
			const builder = new ButtonBuilder()
				.setCustomId(rolePanelId.encode('grant', { buttonId: button.id, roleId: button.roleId }))
				.setLabel(button.label)
				.setStyle(BUTTON_STYLES[button.style] ?? ButtonStyle.Secondary);
			// 저장된 값이 깨졌어도(구버전 데이터 등) 메시지 전체가 실패하지 않게 이모지만 건너뛰어요.
			if (button.emoji && isValidRolePanelEmoji(button.emoji)) builder.setEmoji(button.emoji);
			row.addComponents(builder);
		}
		rows.push(row);
	}

	if (rows.length > 0) {
		container.addSeparatorComponents(separator());
		container.addActionRowComponents(...rows);
	}
	if (galleryPosition === 'bottom') addGallery();

	return {
		flags: MessageFlags.IsComponentsV2,
		components: [container]
	};
}
