import { container } from '@sapphire/framework';
import {
	type AutocompleteInteraction,
	type ChatInputCommandInteraction,
	MessageFlags,
	PermissionFlagsBits,
	type SlashCommandSubcommandBuilder
} from 'discord.js';
import { emoji } from '@sirubot/utils';
import { formatKstDateTime } from '@sirubot/utils/scheduledMessage';
import { AppError } from '../../../../lib/appError.ts';
import { CHOICE_LIMIT, clipChoiceName } from '../../../../lib/autocomplete.ts';
import { contentSnippet, scheduledMessageNoticeView } from '../views/scheduledMessageViews.ts';

export const name = 'delete';
export const ko = '삭제';
export const description = '예약 메시지를 지워요.';
export const descriptionEn = 'Delete a scheduled message.';
export const preconditions: string[] = ['ManageGuild'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(descriptionEn)
		.setDescriptionLocalizations({ ko: description })
		.addStringOption((o) =>
			o
				.setName('id')
				.setNameLocalizations({ ko: '예약' })
				.setDescription('Scheduled message to delete.')
				.setDescriptionLocalizations({ ko: '지울 예약 메시지' })
				.setRequired(true)
				.setAutocomplete(true)
		);
}

// 자동완성은 precondition을 거치지 않아 직접 권한을 확인해요
export async function autocomplete(interaction: AutocompleteInteraction) {
	if (!interaction.inCachedGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.respond([]);
	const typed = interaction.options.getFocused().trim().toLowerCase();
	const entries = await container.scheduledMessages.list(interaction.guildId).catch(() => []);
	await interaction.respond(
		entries
			.map((entry) => ({ entry, label: `${formatKstDateTime(entry.runAt)} · ${contentSnippet(entry.content, 50)}` }))
			.filter(({ label }) => label.toLowerCase().includes(typed))
			.slice(0, CHOICE_LIMIT)
			.map(({ entry, label }) => ({ name: clipChoiceName(label), value: entry.seriesId }))
	);
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>) {
	const id = interaction.options.getString('id', true);
	await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
	const removed = await container.scheduledMessages.remove(interaction.guildId, id);
	if (!removed) throw new AppError('not_found', '그 예약을 찾지 못했어요. 이미 보냈거나 지워졌을 수 있어요.', { ephemeral: true });
	await interaction.editReply(scheduledMessageNoticeView(`${emoji('success')} 예약을 지웠어요.`));
}
