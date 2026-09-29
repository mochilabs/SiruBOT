import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { createContainer } from '@sirubot/utils';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'previous',
	description: '이전에 재생한 곡을 다시 재생해요.',
	fullCategory: ['음악'],
	preconditions: ['NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'DJOrAlone']
})
export class PreviousCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '이전곡' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '이전에 재생한 곡을 다시 재생해요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const player = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
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
		await this.container.mixerService.clearNext(player).catch(() => null);
		await this.container.mixerService.primeForPlay(player);
		await player.play({ clientTrack: previousTrack });
		player.queue.previous.pop();

		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`⏮️ 이전곡 **${previousTrack.info.title}**을(를) 다시 재생해요.`)
		);

		await interaction.editReply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
