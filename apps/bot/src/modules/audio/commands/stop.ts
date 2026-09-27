import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import * as view from '../view/stop.ts';
import { errorView } from '../view/error.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'stop',
	description: '대기열을 정리하고 노래를 멈춰요',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying', 'DJOrAlone']
})
export class StopCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({
					ko: '정지'
				})
				.setDescription(this.description)
				.setDescriptionLocalizations({
					ko: '대기열을 정리하고 노래를 멈춰요'
				});
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;
		if (!interaction.member.voice.channelId) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('🔇 음성 채널에 먼저 접속해주세요.')]
			});
			return;
		}

		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('❌ 재생 중인 곡이 없어요.')]
			});
			return;
		}

		await interaction.reply({
			components: [view.stop()],
			flags: [MessageFlags.IsComponentsV2]
		});
		player.setData('stopByCommand', true);

		await this.container.mixerService.clearNext(player).catch(() => null);
		await player.stopPlaying();
		await player.disconnect();
	}
}
