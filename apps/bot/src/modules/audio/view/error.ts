import { createContainer } from '@sirubot/utils';
import { TextDisplayBuilder } from 'discord.js';

export function errorView(message: string) {
	const containerComponent = createContainer();
	const textDisplay = new TextDisplayBuilder().setContent(message);

	containerComponent.addTextDisplayComponents(textDisplay);

	return containerComponent;
}
