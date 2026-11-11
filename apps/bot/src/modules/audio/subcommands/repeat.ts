import { container } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import * as view from '../view/repeat.ts';
import * as guildPlayback from '../../../services/guildSettings/playback.ts';
import { actorFromMember } from '../../../features/music/application/actor.ts';

export const name = 'repeat';
export const ko = '반복';
export const description = '반복 모드를 설정해요. 모드를 비우면 현재 설정만 보여줘요.';
/** en-US 기본 설명 (기본 로케일이 영어예요) */
export const descriptionEn = 'Set the repeat mode.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(descriptionEn)
		.setDescriptionLocalizations({ ko: description })
		.addStringOption((option) =>
			option
				.setName('mode')
				.setDescription('Set the repeat mode.')
				.setNameLocalizations({ ko: '모드' })
				.setDescriptionLocalizations({ ko: '반복 모드를 설정해요. 모드를 비우면 현재 설정만 보여줘요.' })
				.addChoices([
					{ name: 'off', name_localizations: { ko: '끄기' }, value: 'off' },
					{ name: 'queue', name_localizations: { ko: '전체 곡' }, value: 'queue' },
					{ name: 'track', name_localizations: { ko: '한 곡' }, value: 'track' }
				])
		);
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	const mode = interaction.options.getString('mode');

	if (mode == null) {
		const repeat = await guildPlayback.getRepeat(container.guildService, interaction.guildId);
		await interaction.reply({
			components: [view.repeatCurrent({ mode: repeat })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});
		return;
	}

	// 인가·값 검증·저장·플레이어 반영(mixer 슬롯 정리 포함)은 유스케이스가 맡아요.
	const { mode: repeatUpdated } = await container.music.setRepeat(actorFromMember(interaction.member), mode);

	await interaction.reply({
		components: [view.repeatUpdated({ mode: repeatUpdated })],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { users: [interaction.user.id], roles: [] }
	});
}
