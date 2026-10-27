import { container, UserError } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { RepeatMode } from 'lavalink-client';
import * as view from '../view/repeat.ts';

export const name = 'repeat';
export const ko = '반복';
export const description = '반복 모드를 설정해요.';
/** en-US 기본 설명 (기본 로케일이 영어예요) */
export const descriptionEn = 'Set the repeat mode.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying', 'DJOrAlone'];

const VALID_REPEAT_MODES = ['off', 'track', 'queue'] as const;

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

	// addChoices로 값이 제한되지만, 방어로 한 번 더 검증한다.
	if (!(VALID_REPEAT_MODES as readonly string[]).includes(mode)) {
		throw new UserError({
			identifier: 'repeat_invalid',
			message: `${emoji('error')} 잘못된 반복 모드 값이에요.`,
			context: { mode }
		});
	}

	const repeatUpdated = await container.guildService.setRepeat(interaction.guildId, mode as RepeatMode);
	const player = container.audio.getPlayer(interaction.guildId);
	await player?.setRepeatMode(repeatUpdated);
	// 반복 모드는 클라이언트가 전이를 소유하므로 mixer 예열 슬롯을 비운다.
	// 'off'로 바뀔 때도 슬롯을 비워야 한다 — track-repeat 중 아밍된 현재 곡이
	// off 전환 뒤에도 남아 ghost-repeat으로 재생되는 것을 막는다 (F2).
	if (player) await container.mixerService.clearNext(player).catch(() => null);

	await interaction.reply({
		components: [view.repeatUpdated({ mode: repeatUpdated })],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { users: [interaction.user.id], roles: [] }
	});
}
