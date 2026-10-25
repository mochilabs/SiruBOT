import { container, UserError } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import * as view from '../view/volume.ts';

export const name = 'volume';
export const ko = '볼륨';
export const description = '플레이어의 볼륨을 설정해요.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone'];

type VolumeTarget = 'music' | 'tts' | 'duck';

const TARGET_LABEL: Record<VolumeTarget, string> = {
	music: '노래 볼륨',
	tts: 'TTS 볼륨',
	duck: 'TTS 덕킹 볼륨'
};

/** 각 target별 최대치 — music/tts는 Lavalink 0..150%, duck은 0..100% (stored as 0..1) */
const TARGET_MAX: Record<VolumeTarget, number> = {
	music: 150,
	tts: 150,
	duck: 100
};

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(description)
		.setDescriptionLocalizations({ ko: description })
		.addStringOption((option) =>
			option
				.setName('target')
				.setNameLocalizations({ ko: '대상' })
				.setDescription('Which volume to adjust.')
				.setDescriptionLocalizations({ ko: '조절할 볼륨을 골라 주세요.' })
				.addChoices(
					{ name: 'Music', name_localizations: { ko: '노래' }, value: 'music' },
					{ name: 'TTS', name_localizations: { ko: 'TTS' }, value: 'tts' },
					{ name: 'TTS Ducking', name_localizations: { ko: 'TTS 덕킹' }, value: 'duck' }
				)
		)
		.addIntegerOption((option) =>
			option
				.setName('volume')
				.setNameLocalizations({ ko: '볼륨' })
				.setDescription('Set the volume of the player.')
				.setDescriptionLocalizations({ ko: '설정할 볼륨을 입력해 주세요.' })
				.setMinValue(0)
				.setMaxValue(150)
		);
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	await interaction.deferReply();

	const target = (interaction.options.getString('target') as VolumeTarget | null) ?? 'music';
	const volume = interaction.options.getInteger('volume');

	if (volume === null) {
		const [musicVolume, ttsVolume, ttsDuck] = await Promise.all([
			container.guildService.getVolume(interaction.guildId),
			container.guildService.getTtsVolume(interaction.guildId),
			container.guildService.getTtsDuck(interaction.guildId)
		]);

		await interaction.editReply({
			components: [view.volumeOverview({ volume: musicVolume, ttsVolume, ttsDuck })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});
		return;
	}

	// Discord 옵션 제약(setMinValue/setMaxValue) 밖 값은 사실상 불가능하지만, 방어로 한 번 더 검증한다.
	const max = TARGET_MAX[target];
	if (volume < 0 || volume > max) {
		throw new UserError({
			identifier: 'volume_invalid',
			message: `${emoji('error')} ${TARGET_LABEL[target]}은(는) **0**부터 **${max}**까지 설정할 수 있어요.`,
			context: { volume }
		});
	}

	if (target === 'music') {
		const { volume: updated } = await container.guildService.updateVolume(interaction.guildId, volume);
		const player = container.audio.getPlayer(interaction.guildId);
		if (player) player.setVolume(updated);

		await interaction.editReply({
			components: [view.volumeUpdated({ volume: updated, target, isPlaying: !!player })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});
		return;
	}

	if (target === 'tts') {
		const { ttsVolume: updated } = await container.guildService.updateTtsVolume(interaction.guildId, volume);

		await interaction.editReply({
			components: [view.volumeUpdated({ volume: updated, target, isPlaying: !!container.audio.getPlayer(interaction.guildId) })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});
		return;
	}

	const { ttsDuckLevel: updatedDuck } = await container.guildService.updateTtsDuck(interaction.guildId, volume / 100);

	await interaction.editReply({
		components: [
			view.volumeUpdated({ volume: Math.round(updatedDuck * 100), target, isPlaying: !!container.audio.getPlayer(interaction.guildId) })
		],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { users: [interaction.user.id], roles: [] }
	});
}
