import { createContainer } from '@sirubot/utils';
import { TextDisplayBuilder } from 'discord.js';

export function stop() {
	const containerComponent = createContainer();
	const textDisplay = new TextDisplayBuilder().setContent('👋 대기열을 비우고 재생을 멈췄어요.');

	containerComponent.addTextDisplayComponents(textDisplay);

	return containerComponent;
}
