import { createContainer } from '@sirubot/utils';
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	SeparatorBuilder,
	SeparatorSpacingSize,
	StringSelectMenuBuilder,
	TextDisplayBuilder
} from 'discord.js';

type FilterPreset = {
	name: string;
	label: string;
	emoji: string;
	description: string;
};

export const FILTER_PRESETS: FilterPreset[] = [
	{ name: 'bassboost', label: '베이스부스트', emoji: '🔊', description: '저음을 강하게 부스트해요.' },
	{ name: 'nightcore', label: '나이트코어', emoji: '🌙', description: '고속 + 고음으로 재생해요.' },
	{ name: 'vaporwave', label: '베이퍼웨이브', emoji: '🌊', description: '저속 + 저음으로 재생해요.' },
	{ name: '8d', label: '8D', emoji: '🎧', description: '입체감 있는 사운드로 재생해요.' },
	{ name: 'karaoke', label: '노래방', emoji: '🎤', description: '보컬을 제거하고 재생해요.' }
];

export const filterCustomIdPrefix = 'filter:';

type FilterViewProps = {
	activeFilters: string[];
};

export function filterView({ activeFilters }: FilterViewProps) {
	const containerComponent = createContainer();

	// 현재 적용 필터 상태
	const statusLines = [];
	statusLines.push(`### 🎛️ 오디오 필터`);

	if (activeFilters.length > 0) {
		const activeLabels = activeFilters
			.map((name) => {
				const preset = FILTER_PRESETS.find((p) => p.name === name);
				return preset ? `${preset.emoji} ${preset.label}` : name;
			})
			.join(', ');
		statusLines.push(`현재 적용 중: **${activeLabels}**`);
	} else {
		statusLines.push(`현재 적용 중인 필터가 없어요.`);
	}

	containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(statusLines.join('\n')));

	// 프리셋 선택 메뉴
	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId(filterCustomIdPrefix + 'select')
		.setPlaceholder('적용할 프리셋을 선택하세요')
		.setMinValues(0)
		.setMaxValues(FILTER_PRESETS.length)
		.addOptions(
			FILTER_PRESETS.map((preset) => ({
				label: preset.label,
				value: preset.name,
				emoji: preset.emoji,
				description: preset.description,
				default: activeFilters.includes(preset.name)
			}))
		);

	const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

	containerComponent.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
	containerComponent.addActionRowComponents(selectRow);

	// 초기화 버튼
	const resetButton = new ButtonBuilder()
		.setCustomId(filterCustomIdPrefix + 'reset')
		.setLabel('필터 초기화')
		.setEmoji('🔄')
		.setStyle(ButtonStyle.Danger)
		.setDisabled(activeFilters.length === 0);

	const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(resetButton);
	containerComponent.addActionRowComponents(buttonRow);

	return containerComponent;
}

export function filterApplied({ filters }: { filters: string[] }) {
	if (filters.length === 0) {
		return createContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent('🔄 모든 필터를 해제했어요.'));
	}

	const labels = filters
		.map((name) => {
			const preset = FILTER_PRESETS.find((p) => p.name === name);
			return preset ? `${preset.emoji} ${preset.label}` : name;
		})
		.join(', ');

	return createContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🎛️ 필터 적용: **${labels}**`));
}
