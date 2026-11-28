import { addSeparator, createContainer, emoji } from '@sirubot/utils';
import { MediaGalleryBuilder, MediaGalleryItemBuilder } from 'discord.js';
import { emojiMakerHeader } from './emojiMaker.ts';

export const PREVIEW_FILE_NAME = 'moji-preview.png';

export interface EmojiProgressViewState {
	description: string;
	fromImage: boolean;
	readDone: boolean;
	readPrompt: string | null;
	queueAhead: number | null;
	drawing: { step: number; total: number } | null;
	hasPreview: boolean;
	reroll?: boolean;
}

export function emojiProgressView(state: EmojiProgressViewState) {
	const lines = emojiMakerHeader(state.description, state.fromImage);
	lines.push('');

	if (!state.reroll) {
		if (state.readDone) {
			const what = state.fromImage ? '이미지를 살펴봤어요' : '설명을 읽었어요';
			lines.push(`${emoji('success')} ${what}${state.readPrompt ? ` · \`${state.readPrompt}\`` : ''}`);
		} else {
			lines.push(state.fromImage ? `${emoji('mag')} **이미지를 살펴보는 중…**` : `${emoji('mag')} **설명을 읽는 중…**`);
		}
	}

	if (state.queueAhead !== null && !state.drawing) {
		lines.push(`${emoji('hourglass')} **차례를 기다리는 중…** 앞에 ${state.queueAhead}개`);
	}

	if (state.drawing) {
		lines.push(`${emoji('palette')} **픽셀을 찍는 중…**`);
	} else if (state.readDone || state.reroll) {
		if (state.queueAhead === null) lines.push(`${emoji('palette')} **붓을 준비하는 중…**`);
	} else {
		lines.push(`-# ${emoji('palette')} 픽셀 찍기`);
	}

	const container = createContainer().addTextDisplayComponents((text) => text.setContent(lines.join('\n')));
	if (state.hasPreview) {
		container.addMediaGalleryComponents(
			new MediaGalleryBuilder().addItems(
				new MediaGalleryItemBuilder().setURL(`attachment://${PREVIEW_FILE_NAME}`).setDescription('그리는 중인 후보')
			)
		);
	}
	addSeparator(container);
	container.addTextDisplayComponents((text) => text.setContent('-# 후보 4장을 그리고 있어요 · 보통 몇 초면 끝나요'));
	return container;
}
