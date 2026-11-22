import { container } from '@sapphire/framework';
import {
	ChannelType,
	type ChatInputCommandInteraction,
	MessageFlags,
	type SlashCommandRoleOption,
	type SlashCommandSubcommandBuilder
} from 'discord.js';
import { emoji } from '@sirubot/utils';
import { buildGiveawayConditions, GIVEAWAY_DAYS_MAX, GIVEAWAY_PRIZE_MAX, GIVEAWAY_WINNERS_MAX, parseGiveawayDuration } from '@sirubot/utils/giveaway';
import { parseKstDateTime } from '@sirubot/utils/scheduledMessage';
import { AppError } from '../../../../lib/appError.ts';
import { giveawayNoticeView } from '../views/giveawayViews.ts';

export const name = 'start';
export const ko = '시작';
export const description = '기브어웨이를 열어요. 참여 조건은 직접 정할 수 있어요.';
export const descriptionEn = 'Start a giveaway with custom entry conditions.';
export const preconditions: string[] = ['ManageGuild'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	const roleOption = (key: string, ko: string, en: string, descKo: string) => (o: SlashCommandRoleOption) =>
		o.setName(key).setNameLocalizations({ ko }).setDescription(en).setDescriptionLocalizations({ ko: descKo });
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(descriptionEn)
		.setDescriptionLocalizations({ ko: description })
		.addStringOption((o) =>
			o
				.setName('prize')
				.setNameLocalizations({ ko: '상품' })
				.setDescription('What the winners get.')
				.setDescriptionLocalizations({ ko: '당첨자가 받을 상품' })
				.setRequired(true)
				.setMaxLength(GIVEAWAY_PRIZE_MAX)
		)
		.addIntegerOption((o) =>
			o
				.setName('winners')
				.setNameLocalizations({ ko: '당첨자수' })
				.setDescription('Number of winners (default 1).')
				.setDescriptionLocalizations({ ko: '당첨자 수 (기본 1명)' })
				.setMinValue(1)
				.setMaxValue(GIVEAWAY_WINNERS_MAX)
		)
		.addStringOption((o) =>
			o
				.setName('duration')
				.setNameLocalizations({ ko: '기간' })
				.setDescription('Time until the end, e.g. 30m, 2h, 1d12h.')
				.setDescriptionLocalizations({ ko: '마감까지의 기간. 예: 30분, 2h, 1d12h' })
		)
		.addStringOption((o) =>
			o
				.setName('ends_at')
				.setNameLocalizations({ ko: '마감시각' })
				.setDescription('End time in KST: 2026-12-25 21:00 (use instead of duration).')
				.setDescriptionLocalizations({ ko: '마감 시각(한국 시간). 예: 2026-12-25 21:00 (기간 대신 써요)' })
				.setMinLength(16)
				.setMaxLength(16)
		)
		.addChannelOption((o) =>
			o
				.setName('channel')
				.setNameLocalizations({ ko: '채널' })
				.setDescription('Channel to post in (default: here).')
				.setDescriptionLocalizations({ ko: '카드를 올릴 채널 (기본: 이 채널)' })
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
		)
		.addRoleOption(roleOption('required_role', '필요역할', 'Role required to enter.', '참여에 필요한 역할'))
		.addRoleOption(roleOption('required_role_2', '필요역할2', 'Second required role.', '참여에 필요한 두 번째 역할'))
		.addRoleOption(roleOption('required_role_3', '필요역할3', 'Third required role.', '참여에 필요한 세 번째 역할'))
		.addStringOption((o) =>
			o
				.setName('role_match')
				.setNameLocalizations({ ko: '역할조건' })
				.setDescription('With several required roles: any one (default) or all.')
				.setDescriptionLocalizations({ ko: '필요 역할이 여럿일 때: 하나라도(기본) 또는 모두' })
				.addChoices({ name: '하나라도 있으면', value: 'any' }, { name: '모두 있어야', value: 'all' })
		)
		.addRoleOption(roleOption('blocked_role', '제외역할', 'Members with this role cannot enter.', '이 역할이 있으면 참여할 수 없어요'))
		.addRoleOption(roleOption('blocked_role_2', '제외역할2', 'Second excluded role.', '참여할 수 없는 두 번째 역할'))
		.addIntegerOption((o) =>
			o
				.setName('min_join_days')
				.setNameLocalizations({ ko: '가입일수' })
				.setDescription('Days since joining this server.')
				.setDescriptionLocalizations({ ko: '서버에 들어온 지 N일 이상' })
				.setMinValue(1)
				.setMaxValue(GIVEAWAY_DAYS_MAX)
		)
		.addIntegerOption((o) =>
			o
				.setName('min_account_days')
				.setNameLocalizations({ ko: '계정일수' })
				.setDescription('Days since the Discord account was created.')
				.setDescriptionLocalizations({ ko: '디스코드 계정을 만든 지 N일 이상' })
				.setMinValue(1)
				.setMaxValue(GIVEAWAY_DAYS_MAX)
		);
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>) {
	const durationText = interaction.options.getString('duration');
	const endsAtText = interaction.options.getString('ends_at');
	if ((durationText === null) === (endsAtText === null)) {
		throw new AppError('invalid_input', '마감은 기간 또는 마감시각 중 하나만 정해 주세요.', { ephemeral: true });
	}
	let endsAt: Date;
	if (durationText !== null) {
		const ms = parseGiveawayDuration(durationText);
		if (ms === null) throw new AppError('invalid_input', '기간은 "30분", "2h", "1d12h"처럼 적어 주세요.', { ephemeral: true });
		endsAt = new Date(Date.now() + ms);
	} else {
		const parsed = parseKstDateTime(endsAtText!);
		if (!parsed) throw new AppError('invalid_input', '마감시각은 "2026-12-25 21:00"처럼 적어 주세요. (한국 시간)', { ephemeral: true });
		endsAt = parsed;
	}

	const roles = (...keys: string[]) =>
		keys.flatMap((key) => {
			const role = interaction.options.getRole(key);
			return role ? [role.id] : [];
		});
	const conditions = buildGiveawayConditions({
		requiredRoleIds: roles('required_role', 'required_role_2', 'required_role_3'),
		requiredMatch: (interaction.options.getString('role_match') as 'any' | 'all' | null) ?? 'any',
		blockedRoleIds: roles('blocked_role', 'blocked_role_2'),
		minJoinDays: interaction.options.getInteger('min_join_days'),
		minAccountAgeDays: interaction.options.getInteger('min_account_days')
	});

	await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
	const channelId = interaction.options.getChannel('channel')?.id ?? interaction.channelId;
	await container.giveaways.start({
		guildId: interaction.guildId,
		channelId,
		userId: interaction.user.id,
		prize: interaction.options.getString('prize', true),
		winnerCount: interaction.options.getInteger('winners') ?? 1,
		endsAt,
		conditions
	});
	await interaction.editReply(giveawayNoticeView(`${emoji('success')} 기브어웨이를 열었어요. <#${channelId}>에서 확인하세요.`));
}
