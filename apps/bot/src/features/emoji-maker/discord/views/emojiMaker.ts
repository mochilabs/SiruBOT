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
	/** 영어로 옮겼거나 이미지에서 만든 설명 — 원문과 다를 때만 보여줘요. */
	translatedPrompt: string | null;
	/** 첨부 이미지를 읽어서 그렸는지 */
	fromImage: boolean;
	candidateCount: number;
	/** 후보 번호 → 등록된 이모지 마크업 (`<:name:id>`) */
	registered: ReadonlyMap<number, string>;
	/** 'active' 버튼 사용 가능 · 'busy' 다시 그리는 중 · 'expired' 시간이 지나 버튼을 닫음 */
	phase: 'active' | 'busy' | 'expired';
	feedback?: string;
}

/** 첨부 이름 — 뷰의 MediaGallery와 전송부의 AttachmentBuilder가 같은 이름을 써야 이미지가 붙어요. */
export const candidateFileName = (index: number) => `moji-${index + 1}.png`;

export function emojiMakerView(state: EmojiMakerViewState) {
	const description = state.description.replace(/\n/g, ' ');
	const lines = [`### ${emoji('sparkle')} 이모지 만들기`];
	if (state.fromImage) {
		lines.push(`> 📎 첨부한 이미지${description ? ` · ${description}` : ''}`);
		if (state.translatedPrompt) lines.push(`-# 이미지를 보고 이렇게 그렸어요: ${state.translatedPrompt}`);
	} else {
		lines.push(`> ${description}`);
		if (state.translatedPrompt) lines.push(`-# 영어로 옮겨서 그렸어요: ${state.translatedPrompt}`);
	}
	const container = createContainer().addTextDisplayComponents((text) => text.setContent(lines.join('\n')));

	const gallery = new MediaGalleryBuilder();
	for (let i = 0; i < state.candidateCount; i++) {
		gallery.addItems(new MediaGalleryItemBuilder().setURL(`attachment://${candidateFileName(i)}`).setDescription(`${i + 1}번 후보`));
	}
	container.addMediaGalleryComponents(gallery);

	const locked = state.phase !== 'active';
	// 등록할 후보는 셀렉트 메뉴로 골라요. 이미 등록한 후보는 빼고, 다 등록했으면 메뉴를 잠가요(옵션은 최소 1개가 필요해서 자리만 채워요).
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
