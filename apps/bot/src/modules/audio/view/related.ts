import { DEFAULT_COLOR, emoji } from '@sirubot/utils';
import { ContainerBuilder } from 'discord.js';

export function relatedUpdated(related: boolean) {
	return new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent(`${emoji('sparkle')} 추천 곡 자동재생을 ${related ? '켰어요.' : '껐어요.'}`)
		);
}

export function relatedCurrent(related: boolean) {
	return new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent(`${emoji('sparkle')} 현재 추천 곡 자동 재생은 **${related ? '켜져' : '꺼져'}** 있어요.`)
		);
}
