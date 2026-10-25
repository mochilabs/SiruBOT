import { DEFAULT_COLOR, emoji, emojiProgressBar, volumeToEmoji } from '@sirubot/utils';
import { ContainerBuilder } from 'discord.js';

export type VolumeTarget = 'music' | 'tts' | 'duck';

type volumeUpdatedProps = {
	volume: number;
	target: VolumeTarget;
	isPlaying: boolean;
};

function row(label: string, value: number, maxValue: number): string {
	return `${volumeToEmoji(value)} **${label}** ${emojiProgressBar(value / maxValue)} \`${value}%\``;
}

export function volumeOverview({ volume, ttsVolume, ttsDuck }: { volume: number; ttsVolume: number; ttsDuck: number }) {
	return new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent(`### ${emoji('volume_up')} 볼륨 설정\n-# 노래 · TTS · TTS 덕킹 볼륨이에요.`)
		)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent([row('노래', volume, 150), row('TTS', ttsVolume, 150), row('TTS 덕킹', Math.round(ttsDuck * 100), 100)].join('\n'))
		);
}

export function volumeUpdated({ volume, target, isPlaying }: volumeUpdatedProps) {
	const label = target === 'music' ? '노래 볼륨' : target === 'tts' ? 'TTS 볼륨' : 'TTS 덕킹 볼륨';
	return new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents((textDisplay) =>
			textDisplay.setContent(
				`${volumeToEmoji(volume)} ${isPlaying ? '현재 ' : ''}${label}을(를) **${volume}%** 로 설정했어요.${!isPlaying ? `\n-# ${emoji('sparkle')} 설정된 볼륨은 다음 재생 시 적용돼요.` : ''}`
			)
		);
}
