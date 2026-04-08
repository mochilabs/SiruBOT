import { ApplyOptions } from '@sapphire/decorators';
import { Command, RegisterBehavior } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, ContainerBuilder, MessageFlags } from 'discord.js';
import { DEFAULT_COLOR } from '@sirubot/utils';
import { envParseArray } from '@skyra/env-utilities';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: '리로드',
	preconditions: ['OwnerOnly']
})
export class ReloadCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand(
			(builder) => {
				builder.setIntegrationTypes(ApplicationIntegrationType.GuildInstall).setName(this.name).setDescription('명령어 리로드');
			},
			{ guildIds: envParseArray('DEV_GUILD_IDS'), behaviorWhenNotIdentical: RegisterBehavior.Overwrite }
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;
		if (!interaction.member.voice.channelId) return;

		const res = await Promise.all(
			this.container.stores.map((store) => {
				const paths = [];
				for (const piece of store.values()) {
					if (piece.location.virtual) continue;
					try {
						piece.reload();
						paths.push({
							name: piece.location.name,
							success: true
						});
					} catch (error) {
						this.container.logger.error(error);
						paths.push({
							name: piece.location.name,
							success: false
						});
					}
				}

				return {
					storeName: store.name,
					pieceNames: paths
				};
			})
		);

		const storesRes = res.map((store) => {
			return `:white_check_mark: \`\`${store.storeName}\`\`\n${store.pieceNames.map((name) => `- \`\`${name.name}\`\` ${name.success ? ':white_check_mark:' : ':x:'}`).join('\n')}`;
		});

		await interaction.reply({
			components: [
				new ContainerBuilder()
					.setAccentColor(DEFAULT_COLOR)
					.addTextDisplayComponents((textDisplay) => textDisplay.setContent(storesRes.join('\n')))
			],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});
	}
}
