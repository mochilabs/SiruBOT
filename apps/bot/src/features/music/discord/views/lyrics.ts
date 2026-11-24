import { createContainer, emoji } from '@sirubot/utils';
import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { LyricsViewMode } from '../utils/lyricsText.ts';

/** 가사 메시지 버튼 customId — 컬렉터가 직접 읽는 값이라 이 모듈 안에서만 써요 */
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
	/** 번역 상태 — ready면 보기 방식 버튼, pending이면 새로고침 버튼, none이면 번역 버튼이 없어요 */
	translation: 'ready' | 'pending' | 'none';
	mode: LyricsViewMode;
	/** 시간이 지나 버튼을 끌 때 */
	disabled?: boolean;
	/** 재생 중인 곡의 줄 싱크 가사라 실시간 보기 버튼을 보여줄 때 */
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

/** 실시간 가사 메시지 — 줄이 넘어갈 때마다 본문만 바뀌고, 누구나 정지할 수 있어요. */
export function liveLyricsView(trackName: string, liveText: string) {
	return createContainer()
		.addTextDisplayComponents((text) => text.setContent(`### ${emoji('music_notes')} ${trackName}\n\n${liveText}`))
		.addActionRowComponents((row) =>
			row.addComponents(new ButtonBuilder().setCustomId(LYRICS_BUTTON_IDS.liveStop).setLabel('정지').setStyle(ButtonStyle.Secondary))
		);
}
