import { container, UserError } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import * as view from '../view/volume.ts';

export const name = 'volume';
export const ko = '볼륨';
export const description = '플레이어의 볼륨을 설정해요.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(description)
		.setDescriptionLocalizations({ ko: description })
		.addIntegerOption((option) =>
			option
				.setName('volume')
				.setNameLocalizations({ ko: '볼륨' })
				.setDescription('Set the volume of the player.')
				.setDescriptionLocalizations({ ko: '설정할 볼륨을 입력해주세요.' })
				.setMinValue(0)
				.setMaxValue(150)
		);
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	await interaction.deferReply();

	const volume = interaction.options.getInteger('volume');
	if (volume === null) {
		const savedVolume = await container.guildService.getVolume(interaction.guildId);

		await interaction.editReply({
			components: [view.volumeCurrent({ volume: savedVolume })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});
		return;
	}

	if (volume < 0 || volume > 150) {
		throw new UserError({
			identifier: 'volume_invalid',
			message: '❌  볼륨은 **0**부터 **150**까지 설정할 수 있어요.',
			context: { volume }
		});
	}

	const { volume: volumeUpdated } = await container.guildService.updateVolume(interaction.guildId, volume);
	const player = container.audio.getPlayer(interaction.guildId);
	if (player) player.setVolume(volumeUpdated);

	await interaction.editReply({
		components: [view.volumeUpdated({ volume: volumeUpdated, isPlaying: !!player })],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { users: [interaction.user.id], roles: [] }
	});
}
