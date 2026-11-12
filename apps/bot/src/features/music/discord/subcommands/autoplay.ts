import { container } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { queueRelatedUpfront } from '../../lavalink/autoPlayRelated.ts';
import * as view from '../views/related.ts';
import * as guildPlayback from '../../../../services/guildSettings/playback.ts';

/** 기존 /related(추천 곡)에서 개명 — /recommend(추천)와 헷갈린다는 지적 반영 */
export const name = 'autoplay';
export const ko = '자동재생';
export const description = '추천 곡 자동재생을 설정해요. 사용을 비우면 현재 설정만 보여줘요.';
/** en-US 기본 설명 (기본 로케일이 영어예요) */
export const descriptionEn = 'Turn autoplay of related tracks on or off.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(descriptionEn)
		.setDescriptionLocalizations({ ko: '추천 곡 자동재생을 설정해요. 사용을 비우면 현재 설정만 보여줘요.' })
		.addBooleanOption((option) =>
			option
				.setName('enabled')
				.setNameLocalizations({ ko: '사용' })
				.setDescription('Enable or disable autoplay of related tracks')
				.setDescriptionLocalizations({ ko: '추천 곡 자동재생을 설정해요. 사용을 비우면 현재 설정만 보여줘요.' })
		);
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	await interaction.deferReply();

	const enabled = interaction.options.getBoolean('enabled');
	if (enabled === null) {
		const current = await guildPlayback.getRelated(container.guildService, interaction.guildId);
		await interaction.editReply({
			components: [view.relatedCurrent(current)],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});
		return;
	}

	const updated = await guildPlayback.setRelated(container.guildService, interaction.guildId, enabled);
	const player = container.audio.getPlayer(interaction.guildId);
	const currentTrack = player?.queue.current;
	if (updated && player?.playing && currentTrack && player.queue.tracks.length === 0) {
		void queueRelatedUpfront(container.lavalink, player, currentTrack).catch((error) => {
			container.logger.warn(`[mixer] related pre-add failed (guild ${interaction.guildId}): ${error}`);
		});
	}
	await interaction.editReply({
		components: [view.relatedUpdated(updated)],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { users: [interaction.user.id], roles: [] }
	});
}
