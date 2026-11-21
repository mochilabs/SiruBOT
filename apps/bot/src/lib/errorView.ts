import { UserError } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextDisplayBuilder } from 'discord.js';

export interface ErrorViewOptions {
	/**
	 * 지원 서버 링크. 값이 있으면 "지원 서버" 링크 버튼을 붙여요 (P-14).
	 * 입력 검증 같은 흔한 안내에는 넘기지 않고, 예기치 못한 오류에만 넘겨요.
	 */
	supportUrl?: string | null;
	/** 컨테이너 강조 색 */
	accentColor?: number;
}

export function errorView(message: string, options: ErrorViewOptions = {}) {
	const containerComponent = createContainer();
	const textDisplay = new TextDisplayBuilder().setContent(message);

	containerComponent.addTextDisplayComponents(textDisplay);
	if (options.accentColor !== undefined) containerComponent.setAccentColor(options.accentColor);
	if (options.supportUrl) {
		containerComponent.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(supportButton(options.supportUrl)));
	}

	return containerComponent;
}

/** "지원 서버" 링크 버튼 — 오류 화면과 `/정보 봇`이 같은 모양을 써요 */
export function supportButton(url: string): ButtonBuilder {
	return new ButtonBuilder().setURL(url).setLabel('지원 서버').setEmoji('💬').setStyle(ButtonStyle.Link);
}

/**
 * 에러 응답의 ephemeral 판정: UserError의 context.ephemeral가 있으면 그 값을 따르고,
 * 없으면 UserError 안내는 전체공개(false), 그 외 실제 오류는 ephemeral(true)로 보내요.
 */
export function resolveErrorEphemeral(error: Error): boolean {
	if (!(error instanceof UserError)) return true;
	const context = error.context;
	return typeof context === 'object' && context !== null && 'ephemeral' in context ? Boolean(context.ephemeral) : false;
}
