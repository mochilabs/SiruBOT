import { addSeparator, createContainer, emoji } from '@sirubot/utils';
import { MediaGalleryBuilder, MediaGalleryItemBuilder } from 'discord.js';
import { emojiMakerHeader } from './emojiMaker.ts';

/** 생성 중 미리보기 첨부 이름 — 후보를 가로로 이은 한 장이에요. */
export const PREVIEW_FILE_NAME = 'moji-preview.png';

export interface EmojiProgressViewState {
	description: string;
	fromImage: boolean;
	/** 설명(또는 이미지)을 다 읽었는지 */
	readDone: boolean;
	/** 읽은 결과로 보낸 영어 설명 — 원문과 다를 때만 */
	readPrompt: string | null;
	/** 앞에 기다리는 생성 수 — 차례가 오면 null */
	queueAhead: number | null;
	/** 그리기 진행 — 시작 전이면 null. 화면엔 숫자를 쓰지 않고 그리는 중인지만 보여줘요. */
	drawing: { step: number; total: number } | null;
	/** PREVIEW_FILE_NAME 첨부가 함께 가는지 */
	hasPreview: boolean;
	/** 다시 그리기면 첫 단계(읽기)를 빼요 */
	reroll?: boolean;
}

/**
 * "그리는 중" 화면 — 단계 목록(읽기 → 차례 기다리기 → 픽셀 찍기)과
 * 칠해지는 중인 후보 미리보기를 보여줘요. 진행 바 대신 미리보기가 채워지는 모습으로 진행을 느끼게 해요. 끝난 단계는 ✅, 진행 중은 강조, 남은 단계는 흐리게 적어요.
 */
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
