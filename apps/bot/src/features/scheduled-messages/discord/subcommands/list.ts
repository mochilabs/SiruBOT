import { container } from '@sapphire/framework';
import { type ChatInputCommandInteraction, MessageFlags, type SlashCommandSubcommandBuilder } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { scheduledMessageListView, scheduledMessageNoticeView } from '../views/scheduledMessageViews.ts';

export const name = 'list';
export const ko = '목록';
export const description = '이 서버의 예약 메시지를 보여줘요.';
export const descriptionEn = 'List the scheduled messages of this server.';
export const preconditions: string[] = ['ManageGuild'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub.setName(name).setNameLocalizations({ ko }).setDescription(descriptionEn).setDescriptionLocalizations({ ko: description });
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>) {
	await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
	const entries = await container.scheduledMessages.list(interaction.guildId);
	if (entries.length === 0) {
		await interaction.editReply(scheduledMessageNoticeView(`${emoji('info')} 예약된 메시지가 없어요. /공지 만들기로 예약할 수 있어요.`));
		return;
	}
	await interaction.editReply(scheduledMessageListView(entries));
}
