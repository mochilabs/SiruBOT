import { UserError } from '@sapphire/framework';
import { createContainer, emoji } from '@sirubot/utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextDisplayBuilder } from 'discord.js';

export interface ErrorViewOptions {
	supportUrl?: string | null;
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

export function supportButton(url: string): ButtonBuilder {
	return new ButtonBuilder().setURL(url).setLabel('지원 서버').setEmoji(emoji('speech')).setStyle(ButtonStyle.Link);
}

export function resolveErrorEphemeral(error: Error): boolean {
	if (!(error instanceof UserError)) return true;
	const context = error.context;
	return typeof context === 'object' && context !== null && 'ephemeral' in context ? Boolean(context.ephemeral) : false;
}
