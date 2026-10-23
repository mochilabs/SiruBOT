import { UserError } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import { TextDisplayBuilder } from 'discord.js';

export function errorView(message: string) {
	const containerComponent = createContainer();
	const textDisplay = new TextDisplayBuilder().setContent(message);

	containerComponent.addTextDisplayComponents(textDisplay);

	return containerComponent;
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
