import { container } from '@sapphire/framework';
import { type ChatInputCommandInteraction, MessageFlags, type SlashCommandSubcommandBuilder } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { AppError } from '../../../../lib/appError.ts';
import { giveawayNoticeView } from '../views/giveawayViews.ts';
import { giveawayAutocomplete, giveawayIdOption } from './giveawayAutocomplete.ts';

export const name = 'end';
export const ko = '종료';
export const description = '진행 중인 기브어웨이를 지금 마감하고 추첨해요.';
export const descriptionEn = 'End a running giveaway now and draw winners.';
export const preconditions: string[] = ['ManageGuild'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(descriptionEn)
		.setDescriptionLocalizations({ ko: description })
		.addStringOption((o) => giveawayIdOption(o, 'Giveaway to end.', '마감할 기브어웨이'));
}

export const autocomplete = giveawayAutocomplete(['running']);

export async function run(interaction: ChatInputCommandInteraction<'cached'>) {
	await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
	const result = await container.giveaways.endNow(interaction.guildId, interaction.options.getString('giveaway', true));
	if (result !== 'ended') throw new AppError('not_found', '진행 중인 그 기브어웨이를 찾지 못했어요.', { ephemeral: true });
	await interaction.editReply(giveawayNoticeView(`${emoji('success')} 마감하고 당첨자를 뽑았어요.`));
}
