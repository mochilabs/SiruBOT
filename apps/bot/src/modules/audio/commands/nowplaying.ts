import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import * as view from '../view/nowplaying.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'nowplaying',
	description: '현재 재생 중인 곡의 정보를 보여줘요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying']
})
export class NowPlayingCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '현재곡' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '현재 재생 중인 곡의 정보를 보여줘요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const player = this.container.audio.getPlayer(interaction.guildId);
		const current = player?.queue.current;

		if (!player || !current) {
			await interaction.reply({
				components: [view.nowplayingEmpty()],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
			return;
		}

		await this.container.playerNotifier.sendController(player, interaction);
	}
}
