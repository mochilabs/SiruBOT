import { container } from '@sapphire/framework';
import { type ChatInputCommandInteraction, MessageFlags, type SlashCommandSubcommandBuilder } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { AppError } from '../../../../lib/appError.ts';
import { giveawayNoticeView } from '../views/giveawayViews.ts';
import { giveawayAutocomplete, giveawayIdOption } from './giveawayAutocomplete.ts';

export const name = 'cancel';
export const ko = '취소';
export const description = '진행 중인 나눔을 추첨 없이 취소해요.';
export const descriptionEn = 'Cancel a running giveaway without drawing.';
export const preconditions: string[] = ['ManageGuild'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(descriptionEn)
		.setDescriptionLocalizations({ ko: description })
		.addStringOption((o) => giveawayIdOption(o, 'Giveaway to cancel.', '취소할 나눔'));
}

export const autocomplete = giveawayAutocomplete(['running']);

export async function run(interaction: ChatInputCommandInteraction<'cached'>) {
	await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
	const result = await container.giveaways.cancel(interaction.guildId, interaction.options.getString('giveaway', true));
	if (result !== 'cancelled') throw new AppError('not_found', '진행 중인 그 나눔을 찾지 못했어요.', { ephemeral: true });
	await interaction.editReply(giveawayNoticeView(`${emoji('success')} 나눔을 취소했어요.`));
}
