import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { settingsId } from '../customIds.ts';

export function jtcTemplateModal(template: string) {
	return new ModalBuilder()
		.setCustomId(settingsId.encode('jtcTemplateModal'))
		.setTitle('방 이름 템플릿')
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				new TextInputBuilder()
					.setCustomId(settingsId.encode('jtcTemplateInput'))
					.setLabel('방 이름 템플릿')
					.setPlaceholder('{user}의 방')
					.setStyle(TextInputStyle.Short)
					.setRequired(true)
					.setMaxLength(100)
					.setValue(template)
			)
		);
}

/** 크로스페이드 겹침 시간(0.5~15초) — 초 단위 숫자 문자열을 받아요 */
export function crossfadeModal(seconds: number) {
	return new ModalBuilder()
		.setCustomId(settingsId.encode('crossfadeModal'))
		.setTitle('크로스페이드 겹침 시간')
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				new TextInputBuilder()
					.setCustomId(settingsId.encode('crossfadeInput'))
					.setLabel('곡이 겹치는 시간 (0.5~15초)')
					.setPlaceholder('5')
					.setStyle(TextInputStyle.Short)
					.setRequired(true)
					.setMaxLength(6)
					.setValue(String(seconds))
			)
		);
}

/** AutoMix 박자 분석 기준 — 비워 두면 기존 값을 유지해요 */
export function automixModal(current: { maxTempoChangePercent: number; minConfidence: number }) {
	return new ModalBuilder()
		.setCustomId(settingsId.encode('automixModal'))
		.setTitle('AutoMix 고급 설정')
		.addComponents(
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				new TextInputBuilder()
					.setCustomId(settingsId.encode('automixTempoInput'))
					.setLabel('최대 템포 변경 비율 (0~12%)')
					.setStyle(TextInputStyle.Short)
					.setRequired(false)
					.setMaxLength(6)
					.setValue(String(current.maxTempoChangePercent))
			),
			new ActionRowBuilder<TextInputBuilder>().addComponents(
				new TextInputBuilder()
					.setCustomId(settingsId.encode('automixConfidenceInput'))
					.setLabel('최소 신뢰도 (0~1)')
					.setStyle(TextInputStyle.Short)
					.setRequired(false)
					.setMaxLength(6)
					.setValue(String(current.minConfidence))
			)
		);
}
