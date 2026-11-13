import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder
} from 'discord.js';
import { DEFAULT_COLOR, emoji } from '@sirubot/utils';
import { isValidRolePanelEmoji } from '@sirubot/utils/rolePanel';
import { rolePanelId } from '../customIds.ts';
import type { RolePanel, RolePanelButton } from '@sirubot/prisma';

/** 버튼 스타일 문자열 → Discord ButtonStyle 매핑. */
const BUTTON_STYLES: Record<string, ButtonStyle> = {
	secondary: ButtonStyle.Secondary,
	primary: ButtonStyle.Primary,
	success: ButtonStyle.Success,
	danger: ButtonStyle.Danger
};

/** 한 행에 넣을 버튼 수 (Discord 버튼 상한). */
const BUTTONS_PER_ROW = 5;

/**
 * 길드 유저들이 자기 역할을 토글할 수 있는 공개 역할 패널 메시지 뷰 (Components V2).
 *
 * - 제목·안내문 + 역할 버튼(5개/행).
 * - customId: `role-panel:v1:grant:<buttonId>:<roleId>` — roleId 스냅샷 (게시 당시 역할 고정).
 * - 버튼은 최대 25개(5행) → 제목·안내문·구분선을 더해도 40 컴포넌트 상한 아래.
 */
export function rolePanelView(
	panel: RolePanel,
	buttons: RolePanelButton[]
): { flags: number; components: (ContainerBuilder | ActionRowBuilder<ButtonBuilder>)[] } {
	const container = new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${emoji('ticket')} ${panel.title}`));

	if (panel.description) {
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(panel.description));
	}

	// 반응 모드 — 버튼 대신 "이모지 라벨" 목록을 보여주고, 봇이 같은 이모지로 반응을 달아 둬요.
	if (panel.mode === 'reaction') {
		container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
		const lines = buttons.map((button) => `${button.emoji ?? ''} **${button.label}**`.trim());
		lines.push('', '-# 이모지를 누르면 역할을 받고, 다시 누르면 해제돼요.');
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
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

	return {
		flags: MessageFlags.IsComponentsV2,
		components: [container, ...rows]
	};
}
