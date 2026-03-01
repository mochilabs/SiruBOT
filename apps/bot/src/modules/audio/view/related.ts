import { DEFAULT_COLOR, EMOJI_SPARKLE } from '@sirubot/utils';
import { ContainerBuilder } from 'discord.js';

export function relatedUpdated(related: boolean) {
	return new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents((textDisplay) => textDisplay.setContent(`${EMOJI_SPARKLE} 추천 곡 자동재생을 ${related ? '켰어요.' : '껐어요.'}`));
}

export function relatedCurrent(related: boolean) {
	return new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent(`${EMOJI_SPARKLE} 현재 추천 곡 자동 재생은 **${related ? '켜져' : '꺼져'}** 있어요.`)
		);
}
