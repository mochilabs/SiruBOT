import { container } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { queueRelatedUpfront } from '../lavalink/autoPlayRelated.ts';
import * as view from '../view/related.ts';

/** 기존 /related(추천곡)에서 개명 — /recommend(추천)와 헷갈린다는 지적 반영 */
export const name = 'autoplay';
export const ko = '자동재생';
export const description = '추천곡 자동재생을 켜거나 꺼요.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(description)
		.setDescriptionLocalizations({ ko: '추천곡 자동재생을 켜거나 끕니다.' })
		.addBooleanOption((option) =>
			option
				.setName('enabled')
				.setNameLocalizations({ ko: '사용' })
				.setDescription('Enable or disable autoplay of related tracks')
				.setDescriptionLocalizations({ ko: '추천곡 자동재생을 켜거나 끕니다.' })
		);
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	await interaction.deferReply();

	const enabled = interaction.options.getBoolean('enabled');
	if (enabled === null) {
		const current = await container.guildService.getRelated(interaction.guildId);
		await interaction.editReply({
			components: [view.relatedCurrent(current)],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});
		return;
	}

	const updated = await container.guildService.setRelated(interaction.guildId, enabled);
	const player = container.audio.getPlayer(interaction.guildId);
	const currentTrack = player?.queue.current;
	if (updated && player?.playing && currentTrack && player.queue.tracks.length === 0) {
		void queueRelatedUpfront(player, currentTrack).catch((error) => {
			container.logger.warn(`[mixer] related pre-add failed (guild ${interaction.guildId}): ${error}`);
		});
	}
	await interaction.editReply({
		components: [view.relatedUpdated(updated)],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { users: [interaction.user.id], roles: [] }
	});
}
