import { addSeparator, createContainer, emoji } from '@sirubot/utils';
import { ButtonBuilder, ButtonStyle, MediaGalleryBuilder, MediaGalleryItemBuilder } from 'discord.js';
import { mojiId } from '../customIds.ts';

export interface EmojiMakerViewState {
	description: string;
	/** 영어로 옮겼을 때만 보여줘요. */
	translatedPrompt: string | null;
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
	const lines = [`### ${emoji('sparkle')} 이모지 만들기`, `> ${state.description.replace(/\n/g, ' ')}`];
	if (state.translatedPrompt) lines.push(`-# 영어로 옮겨서 그렸어요: ${state.translatedPrompt}`);
	const container = createContainer().addTextDisplayComponents((text) => text.setContent(lines.join('\n')));

	const gallery = new MediaGalleryBuilder();
	for (let i = 0; i < state.candidateCount; i++) {
		gallery.addItems(new MediaGalleryItemBuilder().setURL(`attachment://${candidateFileName(i)}`).setDescription(`${i + 1}번 후보`));
	}
	container.addMediaGalleryComponents(gallery);

	const locked = state.phase !== 'active';
	container.addActionRowComponents((row) =>
		row.addComponents(
			Array.from({ length: state.candidateCount }, (_, i) => {
				const done = state.registered.has(i);
				return new ButtonBuilder()
					.setCustomId(mojiId.encode('register', { index: i }))
					.setLabel(done ? `${i + 1}번 등록됨` : `${i + 1}번 등록`)
					.setStyle(done ? ButtonStyle.Secondary : ButtonStyle.Success)
					.setDisabled(locked || done);
			})
		)
	);
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
			? '-# 버튼 사용 시간이 지났어요. 새로 만들려면 명령어를 다시 써 주세요.'
			: '-# 등록하려면 서버 이모지 관리 권한이 필요해요 · 버튼은 5분 동안 쓸 수 있어요'
	);
	footer.push('-# Tessera-small (CC BY-NC 4.0)로 그렸어요');
	addSeparator(container);
	container.addTextDisplayComponents((text) => text.setContent(footer.join('\n')));
	return container;
}
