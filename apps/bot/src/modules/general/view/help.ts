import { createContainer, DEFAULT_COLOR } from '@sirubot/utils';
import type { ContainerBuilder } from 'discord.js';

const TYPING_CURSOR = '▍';

export function helpView(content: string, typing: boolean): ContainerBuilder {
	const container = createContainer();
	container.setAccentColor(DEFAULT_COLOR);
	container.addTextDisplayComponents((t) => t.setContent(typing ? `${content}${TYPING_CURSOR}` : content));
	return container;
}
