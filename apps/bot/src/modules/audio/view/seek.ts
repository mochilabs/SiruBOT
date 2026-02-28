import { createContainer, formatTime } from '@sirubot/utils';
import { TextDisplayBuilder } from 'discord.js';

export function seekSuccess({ position }: { position: number }) {
	return createContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent(`⏩ **${formatTime(position / 1000)}**(으)로 이동했어요.`));
}
