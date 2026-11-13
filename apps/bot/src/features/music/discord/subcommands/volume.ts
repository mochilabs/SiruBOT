import { container, UserError } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import * as view from '../views/volume.ts';
import * as guildPlayback from '../../../../services/guildSettings/playback.ts';
import { actorFromMember } from '../../application/actor.ts';

export const name = 'volume';
export const ko = '볼륨';
export const description = '볼륨을 설정해요. 볼륨을 비우면 현재 설정만 보여줘요.';
/** en-US 기본 설명 (기본 로케일이 영어예요) */
export const descriptionEn = 'Set the player volume.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying', 'DJOrAlone'];

type VolumeTarget = 'music' | 'tts' | 'duck';

const TARGET_LABEL: Record<VolumeTarget, string> = {
	music: '노래 볼륨',
	tts: 'TTS 볼륨',
	duck: '낭독 중 음악 볼륨'
};

/** music은 유스케이스(`container.music`)가 검증해요 — 이 표는 아직 어댑터가 직접 처리하는 TTS 계열 최대치예요. tts는 0..150%, duck은 0..100% (stored as 0..1) */
const TARGET_MAX: Record<Exclude<VolumeTarget, 'music'>, number> = {
	tts: 150,
	duck: 100
};

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(descriptionEn)
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
					{ name: 'TTS Ducking', name_localizations: { ko: '낭독중음악' }, value: 'duck' }
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
			guildPlayback.getVolume(container.guildService, interaction.guildId),
			guildPlayback.getTtsVolume(container.guildService, interaction.guildId),
			guildPlayback.getTtsDuck(container.guildService, interaction.guildId)
		]);

		await interaction.editReply({
			components: [view.volumeOverview({ volume: musicVolume, ttsVolume, ttsDuck })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});
		return;
	}

	if (target === 'music') {
		// 인가·범위 검증·저장·플레이어 반영은 유스케이스가 맡아요.
		const { volume: updated, playing } = await container.music.setVolume(actorFromMember(interaction.member), volume);

		await interaction.editReply({
			components: [view.volumeUpdated({ volume: updated, target, isPlaying: playing })],
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

	if (target === 'tts') {
		const { ttsVolume: updated } = await guildPlayback.updateTtsVolume(container.guildService, interaction.guildId, volume);

		await interaction.editReply({
			components: [view.volumeUpdated({ volume: updated, target, isPlaying: !!container.audio.getPlayer(interaction.guildId) })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});
		return;
	}

	const { ttsDuckLevel: updatedDuck } = await guildPlayback.updateTtsDuck(container.guildService, interaction.guildId, volume / 100);

	await interaction.editReply({
		components: [
			view.volumeUpdated({ volume: Math.round(updatedDuck * 100), target, isPlaying: !!container.audio.getPlayer(interaction.guildId) })
		],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { users: [interaction.user.id], roles: [] }
	});
}
