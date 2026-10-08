import { DEFAULT_COLOR, emoji, type AppEmojiFallbackKey } from '@sirubot/utils';
import { ContainerBuilder } from 'discord.js';
import { RepeatMode } from 'lavalink-client';

type RepeatUpdatedProps = {
	mode: RepeatMode;
};

const REPEAT_MODE_EMOJI_NAMES: Record<RepeatMode, AppEmojiFallbackKey> = {
	off: 'arrow_forward',
	track: 'repeat_one',
	queue: 'repeat'
} as const;

/** repeat 모드 표기 이모지 — 컨트롤러 버튼과 뷰 텍스트가 함께 써요 */
export const repeatEmoji = (mode: RepeatMode) => emoji(REPEAT_MODE_EMOJI_NAMES[mode]);

const REPEAT_MODE_NAMES: Record<RepeatMode, string> = {
	off: '끄기',
	track: '한 곡',
	queue: '전체 곡'
} as const;

const UPDATED_REPEAT_MODE_NAMES: Record<RepeatMode, string> = {
	off: '껐어요.',
	track: '**한 곡** 반복으로 설정했어요',
	queue: '**전체 곡** 반복으로 설정했어요'
} as const;

export function repeatUpdated({ mode }: RepeatUpdatedProps) {
	return new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents((textDisplay) => textDisplay.setContent(`${repeatEmoji(mode)} 반복 모드를 ${UPDATED_REPEAT_MODE_NAMES[mode]}`));
}

export function repeatCurrent({ mode }: RepeatUpdatedProps) {
	return new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents((textDisplay) => textDisplay.setContent(`${repeatEmoji(mode)} 현재 반복 모드 **${REPEAT_MODE_NAMES[mode]}**`));
}
