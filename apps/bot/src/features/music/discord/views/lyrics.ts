import { createContainer, emoji } from '@sirubot/utils';
import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { LyricsViewMode } from '../utils/lyricsText.ts';

export const LYRICS_BUTTON_IDS = {
	original: 'lyrics:original',
	translation: 'lyrics:translation',
	both: 'lyrics:both',
	refresh: 'lyrics:refresh',
	live: 'lyrics:live',
	liveStop: 'lyrics:live-stop'
} as const;

const MODE_LABELS: ReadonlyArray<{ mode: LyricsViewMode; label: string }> = [
	{ mode: 'original', label: '원문' },
	{ mode: 'translation', label: '번역' },
	{ mode: 'both', label: '둘 다' }
];

export interface LyricsViewOptions {
	translation: 'ready' | 'pending' | 'none';
	mode: LyricsViewMode;
	disabled?: boolean;
	live?: boolean;
}

export function lyricsView(trackName: string, lyrics: string, options?: LyricsViewOptions) {
	const container = createContainer().addTextDisplayComponents((text) => text.setContent(`### ${emoji('music_notes')} ${trackName}\n\n${lyrics}`));
	if (!options) return container;
	const disabled = options.disabled ?? false;

	const buttons: ButtonBuilder[] = [];
	if (options.translation === 'ready') {
		for (const { mode, label } of MODE_LABELS) {
			buttons.push(
				new ButtonBuilder()
					.setCustomId(LYRICS_BUTTON_IDS[mode])
					.setLabel(label)
					.setStyle(options.mode === mode ? ButtonStyle.Primary : ButtonStyle.Secondary)
					.setDisabled(disabled)
			);
		}
	} else if (options.translation === 'pending') {
		buttons.push(
			new ButtonBuilder().setCustomId(LYRICS_BUTTON_IDS.refresh).setLabel('번역 불러오기').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
		);
	}
	if (options.live) {
		buttons.push(new ButtonBuilder().setCustomId(LYRICS_BUTTON_IDS.live).setLabel('실시간').setStyle(ButtonStyle.Success).setDisabled(disabled));
	}
	if (options.translation === 'pending')
		container.addTextDisplayComponents((text) => text.setContent('-# 한국어 번역을 준비하고 있어요. 잠시 뒤 눌러 주세요.'));
	if (buttons.length === 0) return container;
	return container.addActionRowComponents((row) => row.addComponents(...buttons));
}

export function liveLyricsView(trackName: string, liveText: string) {
	return createContainer()
		.addTextDisplayComponents((text) => text.setContent(`### ${emoji('music_notes')} ${trackName}\n\n${liveText}`))
		.addActionRowComponents((row) =>
			row.addComponents(new ButtonBuilder().setCustomId(LYRICS_BUTTON_IDS.liveStop).setLabel('정지').setStyle(ButtonStyle.Secondary))
		);
}
