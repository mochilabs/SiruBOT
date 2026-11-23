import { createContainer, emoji } from '@sirubot/utils';
import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { LyricsViewMode } from '../utils/lyricsText.ts';

/** 가사 메시지 버튼 customId — 컬렉터가 직접 읽는 값이라 이 모듈 안에서만 써요 */
export const LYRICS_BUTTON_IDS = {
	original: 'lyrics:original',
	translation: 'lyrics:translation',
	both: 'lyrics:both',
	refresh: 'lyrics:refresh'
} as const;

const MODE_LABELS: ReadonlyArray<{ mode: LyricsViewMode; label: string }> = [
	{ mode: 'original', label: '원문' },
	{ mode: 'translation', label: '번역' },
	{ mode: 'both', label: '둘 다' }
];

export interface LyricsViewOptions {
	/** 번역 상태 — ready면 보기 방식 버튼, pending이면 새로고침 버튼, none이면 버튼이 없어요 */
	translation: 'ready' | 'pending' | 'none';
	mode: LyricsViewMode;
	/** 시간이 지나 버튼을 끌 때 */
	disabled?: boolean;
}

export function lyricsView(trackName: string, artistName: string, lyrics: string, options?: LyricsViewOptions) {
	const container = createContainer().addTextDisplayComponents((text) =>
		text.setContent(`### ${emoji('music_notes')} ${trackName} · ${artistName}\n\n${lyrics}`)
	);
	if (!options || options.translation === 'none') return container;

	const buttons =
		options.translation === 'ready'
			? MODE_LABELS.map(({ mode, label }) =>
					new ButtonBuilder()
						.setCustomId(LYRICS_BUTTON_IDS[mode])
						.setLabel(label)
						.setStyle(options.mode === mode ? ButtonStyle.Primary : ButtonStyle.Secondary)
						.setDisabled(options.disabled ?? false)
				)
			: [
					new ButtonBuilder()
						.setCustomId(LYRICS_BUTTON_IDS.refresh)
						.setLabel('번역 불러오기')
						.setStyle(ButtonStyle.Secondary)
						.setDisabled(options.disabled ?? false)
				];
	const note = options.translation === 'pending' ? '-# 한국어 번역을 준비하고 있어요. 잠시 뒤 눌러 주세요.' : null;
	if (note) container.addTextDisplayComponents((text) => text.setContent(note));
	return container.addActionRowComponents((row) => row.addComponents(...buttons));
}
