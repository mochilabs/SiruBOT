import { DEFAULT_COLOR, EMOJI_REPEAT } from '@sirubot/utils';
import { ContainerBuilder } from 'discord.js';
import { RepeatMode } from 'lavalink-client';

type RepeatUpdatedProps = {
	mode: RepeatMode;
};

export const REPEAT_MODE_NAMES: Record<RepeatMode, string> = {
	off: '끄기',
	track: '한 곡',
	queue: '전체 곡'
} as const;

export const UPDATED_REPEAT_MODE_NAMES: Record<RepeatMode, string> = {
	off: '껐어요.',
	track: '**한 곡** 반복으로 설정했어요',
	queue: '**전체 곡** 반복으로 설정했어요'
} as const;

export function repeatUpdated({ mode }: RepeatUpdatedProps) {
	return new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents((textDisplay) => textDisplay.setContent(`${EMOJI_REPEAT[mode]} 반복 모드를 ${UPDATED_REPEAT_MODE_NAMES[mode]}`));
}

export function repeatCurrent({ mode }: RepeatUpdatedProps) {
	return new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents((textDisplay) => textDisplay.setContent(`${EMOJI_REPEAT[mode]} 현재 반복 모드 **${REPEAT_MODE_NAMES[mode]}**`));
}
