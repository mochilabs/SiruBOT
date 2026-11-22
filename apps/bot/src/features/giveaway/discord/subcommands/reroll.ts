import { container } from '@sapphire/framework';
import { type ChatInputCommandInteraction, MessageFlags, type SlashCommandSubcommandBuilder } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { GIVEAWAY_WINNERS_MAX } from '@sirubot/utils/giveaway';
import { giveawayNoticeView } from '../views/giveawayViews.ts';
import { giveawayAutocomplete, giveawayIdOption } from './giveawayAutocomplete.ts';

export const name = 'reroll';
export const ko = '다시뽑기';
export const description = '끝난 기브어웨이에서 새 당첨자를 더 뽑아요.';
export const descriptionEn = 'Draw new winners for an ended giveaway.';
export const preconditions: string[] = ['ManageGuild'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(descriptionEn)
		.setDescriptionLocalizations({ ko: description })
		.addStringOption((o) => giveawayIdOption(o, 'Giveaway to reroll.', '다시 뽑을 기브어웨이'))
		.addIntegerOption((o) =>
			o
				.setName('winners')
				.setNameLocalizations({ ko: '당첨자수' })
				.setDescription('How many new winners (default 1).')
				.setDescriptionLocalizations({ ko: '새로 뽑을 당첨자 수 (기본 1명)' })
				.setMinValue(1)
				.setMaxValue(GIVEAWAY_WINNERS_MAX)
		);
}

export const autocomplete = giveawayAutocomplete(['ended']);

export async function run(interaction: ChatInputCommandInteraction<'cached'>) {
	await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
	const { winnerIds } = await container.giveaways.reroll(
		interaction.guildId,
		interaction.options.getString('giveaway', true),
		interaction.options.getInteger('winners') ?? 1
	);
	await interaction.editReply(giveawayNoticeView(`${emoji('success')} 새 당첨자 ${winnerIds.length}명을 뽑아 발표했어요.`));
}
