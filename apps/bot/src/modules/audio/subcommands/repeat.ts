import { container, UserError } from '@sapphire/framework';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { RepeatMode } from 'lavalink-client';
import * as view from '../view/repeat.ts';

export const name = 'repeat';
export const ko = '반복';
export const description = '반복 모드를 설정해요.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying', 'DJOrAlone'];

const VALID_REPEAT_MODES = ['off', 'track', 'queue'] as const;

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(description)
		.setDescriptionLocalizations({ ko: description })
		.addStringOption((option) =>
			option
				.setName('mode')
				.setDescription('Set the repeat mode.')
				.setNameLocalizations({ ko: '모드' })
				.setDescriptionLocalizations({ ko: '반복 모드를 설정해요.' })
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
		const repeat = await container.guildService.getRepeat(interaction.guildId);
		await interaction.reply({
			components: [view.repeatCurrent({ mode: repeat })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});
		return;
	}

	if (!(VALID_REPEAT_MODES as readonly string[]).includes(mode)) {
		throw new UserError({
			identifier: 'repeat_invalid',
			message: '❌  잘못된 반복 모드 값이에요.',
			context: { mode }
		});
	}

	const repeatUpdated = await container.guildService.setRepeat(interaction.guildId, mode as RepeatMode);
	const player = container.audio.getPlayer(interaction.guildId);
	await player?.setRepeatMode(repeatUpdated);
	// 반복 모드는 클라이언트가 전이를 소유하므로 mixer 예열 슬롯을 비운다.
	if (player && repeatUpdated !== 'off') await container.mixerService.clearNext(player).catch(() => null);

	await interaction.reply({
		components: [view.repeatUpdated({ mode: repeatUpdated })],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { users: [interaction.user.id], roles: [] }
	});
}
