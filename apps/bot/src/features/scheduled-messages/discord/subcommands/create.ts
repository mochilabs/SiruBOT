import { container } from '@sapphire/framework';
import { ChannelType, type ChatInputCommandInteraction, MessageFlags, type SlashCommandSubcommandBuilder } from 'discord.js';
import { emoji } from '@sirubot/utils';
import {
	describeRecurrence,
	formatKstDateTime,
	parseKstDateTime,
	SCHEDULED_MESSAGE_CONTENT_MAX,
	SCHEDULED_MESSAGE_REPEAT_LABELS,
	SCHEDULED_MESSAGE_REPEATS,
	type ScheduledMessageRepeat
} from '@sirubot/utils/scheduledMessage';
import { AppError } from '../../../../lib/appError.ts';
import { scheduledMessageNoticeView } from '../views/scheduledMessageViews.ts';

export const name = 'create';
export const ko = '만들기';
export const description = '정해진 시각에 채널로 메시지를 보내도록 예약해요.';
export const descriptionEn = 'Schedule a message to be sent to a channel at a set time.';
export const preconditions: string[] = ['ManageGuild'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(descriptionEn)
		.setDescriptionLocalizations({ ko: description })
		.addChannelOption((o) =>
			o
				.setName('channel')
				.setNameLocalizations({ ko: '채널' })
				.setDescription('Channel to send to.')
				.setDescriptionLocalizations({ ko: '메시지를 보낼 채널' })
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
				.setRequired(true)
		)
		.addStringOption((o) =>
			o
				.setName('when')
				.setNameLocalizations({ ko: '일시' })
				.setDescription('When to send, in KST: 2026-12-25 09:00')
				.setDescriptionLocalizations({ ko: '보낼 시각(한국 시간). 예: 2026-12-25 09:00' })
				.setRequired(true)
				.setMinLength(16)
				.setMaxLength(16)
		)
		.addStringOption((o) =>
			o
				.setName('content')
				.setNameLocalizations({ ko: '내용' })
				.setDescription('Message text. @everyone and @here are not allowed.')
				.setDescriptionLocalizations({ ko: '보낼 메시지. @everyone, @here는 쓸 수 없어요.' })
				.setRequired(true)
				.setMaxLength(SCHEDULED_MESSAGE_CONTENT_MAX)
		)
		.addStringOption((o) =>
			o
				.setName('repeat')
				.setNameLocalizations({ ko: '반복' })
				.setDescription('Repeat (default: once). Weekly and monthly follow the date above.')
				.setDescriptionLocalizations({ ko: '반복 방식(기본: 한 번). 매주·매월은 위 일시의 요일·날짜를 따라요.' })
				.addChoices(...SCHEDULED_MESSAGE_REPEATS.map((value) => ({ name: SCHEDULED_MESSAGE_REPEAT_LABELS[value], value })))
		);
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>) {
	const channel = interaction.options.getChannel('channel', true);
	const when = interaction.options.getString('when', true);
	const content = interaction.options.getString('content', true);
	const repeat = (interaction.options.getString('repeat') ?? 'none') as ScheduledMessageRepeat;

	const runAt = parseKstDateTime(when);
	if (!runAt) throw new AppError('invalid_input', '일시는 "2026-12-25 09:00"처럼 적어 주세요. (한국 시간)', { ephemeral: true });

	await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
	const entry = await container.scheduledMessages.create({
		guildId: interaction.guildId,
		userId: interaction.user.id,
		channelId: channel.id,
		content,
		runAt,
		repeat
	});
	await interaction.editReply(
		scheduledMessageNoticeView(
			`${emoji('success')} 예약했어요.\n- 채널: <#${entry.channelId}>\n- 시각: ${formatKstDateTime(entry.runAt)} (${describeRecurrence(entry.recurrence)})\n-# 예약 ID: ${entry.seriesId}`
		)
	);
}
