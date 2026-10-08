import { container } from '@sapphire/framework';
import { DEFAULT_COLOR, emoji } from '@sirubot/utils';
import { ChatInputCommandInteraction, ContainerBuilder, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { errorView } from '../view/error.ts';

export const name = 'history';
export const ko = '재생기록';
export const description = '이 서버에서 재생된 최근 음악 기록을 보여줘요.';
export const preconditions = ['TextChannelAllowed'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub.setName(name).setNameLocalizations({ ko }).setDescription(description).setDescriptionLocalizations({ ko: description });
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

	const history = await container.db.guildTrackHistory.findMany({
		where: { guildId: interaction.guildId },
		orderBy: { createdAt: 'desc' },
		take: 15,
		include: { track: true }
	});

	if (history.length === 0) {
		await interaction.editReply({
			components: [errorView(`${emoji('error')} 최근 재생된 음악 기록이 없어요.`)],
			flags: [MessageFlags.IsComponentsV2]
		});
		return;
	}

	const lines = history.map((h, _i) => {
		const timeStr = h.createdAt.toLocaleString('ko-KR', {
			timeZone: 'Asia/Seoul',
			month: '2-digit',
			day: '2-digit',
			hour12: false,
			hour: '2-digit',
			minute: '2-digit'
		});
		const requesterStr = h.userId ? ` | <@${h.userId}>` : '';
		return `\`${timeStr}\` **[${h.track.title}](${h.track.url})** - ${h.track.artist}${requesterStr}`;
	});

	const containerComponent = new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents((textDisplay) => textDisplay.setContent(`### ${emoji('scroll')} 최근 재생 기록\n\n${lines.join('\n')}`));

	await interaction.editReply({
		components: [containerComponent],
		flags: [MessageFlags.IsComponentsV2]
	});
}
