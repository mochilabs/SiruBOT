import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelSelectMenuBuilder,
	ChannelType,
	MessageFlags,
	RoleSelectMenuBuilder,
	StringSelectMenuBuilder,
	TextDisplayBuilder
} from 'discord.js';
import { addSeparator, createContainer, emoji } from '@sirubot/utils';
import { describeGiveawayCondition, GIVEAWAY_ROLES_PER_CONDITION_MAX } from '@sirubot/utils/giveaway';
import { GIVEAWAY_QUICK_DURATIONS, missingSetupFields, setupConditions, type GiveawaySetupState } from '../../application/giveawaySetup.ts';
import { giveawaySetupId } from '../customIds.ts';

const ACCENT = '#FF8FB1';
const unix = (date: Date) => Math.floor(date.getTime() / 1000);

function endText(state: GiveawaySetupState): string {
	if (!state.end) return '_아직 정하지 않았어요_';
	if (state.end.kind === 'absolute') return `<t:${unix(state.end.at)}:f> (<t:${unix(state.end.at)}:R>)`;
	const { ms } = state.end;
	const quick = GIVEAWAY_QUICK_DURATIONS.find((item) => item.ms === ms);
	return `시작하고 나서 ${quick ? quick.label : `${Math.round(ms / 60_000)}분`} 뒤`;
}

export function giveawaySetupSummary(state: GiveawaySetupState): string {
	const conditions = setupConditions(state);
	const lines = [
		`${emoji('party')} **상품** ${state.prize ? state.prize : '_아직 정하지 않았어요_'}`,
		`${emoji('trophy')} **당첨자** ${state.winnerCount}명`,
		`${emoji('hourglass')} **마감** ${endText(state)}`,
		`${emoji('info')} **채널** <#${state.channelId}>`,
		`${emoji('people')} **참여 조건** ${conditions.length === 0 ? '없음 (누구나 참여)' : ''}`
	];
	if (conditions.length > 0) lines.push(...conditions.map((condition) => `- ${describeGiveawayCondition(condition)}`));
	return lines.join('\n');
}

/** `/나눔 시작` 설정 패널 — 버튼·셀렉트로 값을 고르고 "시작"으로 열어요 */
export function giveawaySetupView(state: GiveawaySetupState) {
	const missing = missingSetupFields(state);
	const container = createContainer(ACCENT);
	container.addTextDisplayComponents(
		new TextDisplayBuilder().setContent('## 🎉 나눔 만들기\n-# 상품과 마감만 정하면 시작할 수 있어요. 나머지는 고르지 않으면 기본값이에요.')
	);
	addSeparator(container);
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(giveawaySetupSummary(state)));
	addSeparator(container);

	const quickSelect = new StringSelectMenuBuilder()
		.setCustomId(giveawaySetupId.encode('quick'))
		.setPlaceholder('마감 빠르게 고르기')
		.addOptions(
			GIVEAWAY_QUICK_DURATIONS.map((item) => ({
				label: `${item.label} 뒤에 마감`,
				value: item.value,
				default: state.end?.kind === 'relative' && state.end.ms === item.ms
			}))
		);
	const channelSelect = new ChannelSelectMenuBuilder()
		.setCustomId(giveawaySetupId.encode('channel'))
		.setPlaceholder('카드를 올릴 채널')
		.setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
		.setMinValues(1)
		.setMaxValues(1)
		.setDefaultChannels(state.channelId);
	const roleSelect = (action: 'required' | 'blocked', placeholder: string, ids: readonly string[]) => {
		const select = new RoleSelectMenuBuilder()
			.setCustomId(giveawaySetupId.encode(action))
			.setPlaceholder(placeholder)
			.setMinValues(0)
			.setMaxValues(GIVEAWAY_ROLES_PER_CONDITION_MAX);
		if (ids.length > 0) select.setDefaultRoles(...ids);
		return select;
	};

	container
		.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(giveawaySetupId.encode('prize'))
					.setLabel('상품·당첨자 수')
					.setStyle(state.prize ? ButtonStyle.Secondary : ButtonStyle.Primary),
				new ButtonBuilder().setCustomId(giveawaySetupId.encode('end')).setLabel('마감 직접 입력').setStyle(ButtonStyle.Secondary),
				new ButtonBuilder().setCustomId(giveawaySetupId.encode('days')).setLabel('가입·계정 일수').setStyle(ButtonStyle.Secondary),
				new ButtonBuilder()
					.setCustomId(giveawaySetupId.encode('match'))
					.setLabel(`필요 역할: ${state.requiredMatch === 'all' ? '모두 있어야' : '하나라도'}`)
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(state.requiredRoleIds.length < 2)
			)
		)
		.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(quickSelect))
		.addActionRowComponents(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect))
		.addActionRowComponents(
			new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
				roleSelect('required', '참여에 필요한 역할 (고르지 않으면 제한 없음)', state.requiredRoleIds)
			)
		)
		.addActionRowComponents(
			new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect('blocked', '참여할 수 없는 역할', state.blockedRoleIds))
		)
		.addActionRowComponents(
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(giveawaySetupId.encode('start'))
					.setLabel(missing.length > 0 ? `${missing.join('·')}을(를) 정해 주세요` : '나눔 시작')
					.setStyle(ButtonStyle.Success)
					.setDisabled(missing.length > 0),
				new ButtonBuilder().setCustomId(giveawaySetupId.encode('cancel')).setLabel('취소').setStyle(ButtonStyle.Secondary)
			)
		);

	return { flags: MessageFlags.IsComponentsV2 as const, components: [container], allowedMentions: { parse: [] as never[] } };
}
