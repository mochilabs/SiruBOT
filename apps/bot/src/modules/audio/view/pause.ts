import { createContainer } from '@sirubot/utils';
import { TextDisplayBuilder } from 'discord.js';

export function paused() {
	return createContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent('⏸ 재생을 일시정지했어요.'));
}

export function resumed() {
	return createContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent('▶️ 재생을 다시 시작했어요.'));
}
