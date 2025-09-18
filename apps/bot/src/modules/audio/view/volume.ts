import { DEFAULT_COLOR, volumeToEmoji } from '@sirubot/utils';
import { EmbedBuilder } from 'discord.js';

type volumeUpdatedProps = {
	volume: number;
	isPlaying: boolean;
};

export function volumeUpdated({ volume, isPlaying }: volumeUpdatedProps) {
	const embed = new EmbedBuilder()
		.setDescription(`${volumeToEmoji(volume)} ${isPlaying ? '현재 ' : ''}볼륨을 **${volume}%** 로 설정했어요.`)
		.setColor(DEFAULT_COLOR);

	return !isPlaying ? embed.setFooter({ text: '✨  설정된 볼륨은 다음 재생 시 적용돼요.' }) : embed;
}

export function currentVolume({ volume }: { volume: number }) {
	const embed = new EmbedBuilder()
		.setDescription(`${volumeToEmoji(volume)} 현재 볼륨 **${volume}%**`)
		.setColor(DEFAULT_COLOR);

	return embed;
}