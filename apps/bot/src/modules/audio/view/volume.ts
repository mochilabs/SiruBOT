import { DEFAULT_COLOR, volumeToEmoji } from '@sirubot/utils';
import { ContainerBuilder } from 'discord.js';

type volumeUpdatedProps = {
	volume: number;
	isPlaying: boolean;
};

export function volumeUpdated({ volume, isPlaying }: volumeUpdatedProps) {
	return new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent(
				`${volumeToEmoji(volume)} ${isPlaying ? '현재 ' : ''}볼륨을 **${volume}%** 로 설정했어요.${!isPlaying ? '\n-# ✨  설정된 볼륨은 다음 재생 시 적용돼요.' : ''}`
			)
		);
}

export function volumeCurrent({ volume }: { volume: number }) {
	return new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents((textDisplay) => textDisplay.setContent(`${volumeToEmoji(volume)} 현재 볼륨 **${volume}%**`));
}
