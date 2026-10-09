import { container, UserError } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { createContainer } from '@sirubot/utils';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder, TextDisplayBuilder } from 'discord.js';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';

export const name = 'previous';
export const ko = '이전곡';
export const description = '이전에 재생한 곡을 다시 재생해요.';
export const preconditions = ['NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub.setName(name).setNameLocalizations({ ko }).setDescription(description).setDescriptionLocalizations({ ko: description });
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	const player = container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
	if (!player) {
		throw new UserError({
			identifier: 'PreviousCommandNoPlayer',
			message: '현재 재생 중인 플레이어가 없어요.',
			context: { ephemeral: true }
		});
	}

	if (player.queue.previous.length === 0) {
		throw new UserError({
			identifier: 'PreviousCommandEmptyHistory',
			message: '이전에 재생한 곡이 없어요.',
			context: { ephemeral: true }
		});
	}

	// 복원/필터 준비는 Lavalink REST 왕복이므로 3초 응답 제한에 걸리기 전에 defer한다.
	await interaction.deferReply();

	const previousTrack = player.queue.previous[player.queue.previous.length - 1];
	if (player.queue.current) {
		player.queue.tracks.unshift(player.queue.current);
	}
	await container.mixerService.clearNext(player).catch(() => null);
	await container.mixerService.primeForPlay(player);
	await player.play({ clientTrack: previousTrack });
	player.queue.previous.pop();

	const containerComponent = createContainer();
	containerComponent.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`${emoji('arrow_back')} 이전곡 **${previousTrack.info.title}**을(를) 다시 재생해요.`)
	);

	await interaction.editReply({
		components: [containerComponent],
		flags: [MessageFlags.IsComponentsV2]
	});
}
