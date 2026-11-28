import { addSeparator, createContainer, emoji } from '@sirubot/utils';
import {
	ButtonBuilder,
	ButtonStyle,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder
} from 'discord.js';
import { mojiId } from '../customIds.ts';

export interface EmojiMakerViewState {
	description: string;
	translatedPrompt: string | null;
	fromImage: boolean;
	candidateCount: number;
	registered: ReadonlyMap<number, string>;
	phase: 'active' | 'busy' | 'expired';
	feedback?: string;
}

export const candidateFileName = (index: number) => `moji-${index + 1}.png`;

export function emojiMakerHeader(description: string, fromImage: boolean): string[] {
	const text = description.replace(/\n/g, ' ');
	return [`### ${emoji('sparkle')} 이모지 만들기`, fromImage ? `> 📎 첨부한 이미지${text ? ` · ${text}` : ''}` : `> ${text}`];
}

export function emojiMakerView(state: EmojiMakerViewState) {
	const lines = emojiMakerHeader(state.description, state.fromImage);
	if (state.translatedPrompt) {
		lines.push(`-# ${state.fromImage ? '이미지를 보고 이렇게 그렸어요' : '영어로 옮겨서 그렸어요'}: ${state.translatedPrompt}`);
	}
	const container = createContainer().addTextDisplayComponents((text) => text.setContent(lines.join('\n')));

	const gallery = new MediaGalleryBuilder();
	for (let i = 0; i < state.candidateCount; i++) {
		gallery.addItems(new MediaGalleryItemBuilder().setURL(`attachment://${candidateFileName(i)}`).setDescription(`${i + 1}번 후보`));
	}
	container.addMediaGalleryComponents(gallery);

	const locked = state.phase !== 'active';
	// Discord 셀렉트 메뉴는 비활성화 상태여도 옵션이 최소 1개 필요해요.
	const remaining = Array.from({ length: state.candidateCount }, (_, i) => i).filter((i) => !state.registered.has(i));
	const select = new StringSelectMenuBuilder()
		.setCustomId(mojiId.encode('pick'))
		.setPlaceholder(remaining.length > 0 ? '서버 이모지로 등록할 후보를 골라요' : '모든 후보를 등록했어요')
		.setDisabled(locked || remaining.length === 0);
	if (remaining.length > 0) {
		select.addOptions(remaining.map((i) => new StringSelectMenuOptionBuilder().setLabel(`${i + 1}번 후보`).setValue(String(i))));
	} else {
		select.addOptions(new StringSelectMenuOptionBuilder().setLabel('모두 등록했어요').setValue('none'));
	}
	container.addActionRowComponents((row) => row.addComponents(select));
	container.addActionRowComponents((row) =>
		row.addComponents(
			new ButtonBuilder()
				.setCustomId(mojiId.encode('reroll'))
				.setLabel(state.phase === 'busy' ? '그리는 중…' : '다시 그리기')
				.setEmoji('🔄')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(locked)
		)
	);

	const footer: string[] = [];
	if (state.registered.size > 0) footer.push(`${emoji('success')} 등록한 이모지: ${[...state.registered.values()].join(' ')}`);
	if (state.feedback) footer.push(state.feedback);
	footer.push(
		state.phase === 'expired'
			? '-# 사용 시간이 지났어요. 새로 만들려면 명령어를 다시 써 주세요.'
			: '-# 등록하려면 서버 이모지 관리 권한이 필요해요 · 5분 동안 쓸 수 있어요'
	);
	footer.push('-# Tessera-small (CC BY-NC 4.0)');
	addSeparator(container);
	container.addTextDisplayComponents((text) => text.setContent(footer.join('\n')));
	return container;
}
