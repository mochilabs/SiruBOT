import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { createContainer, BOT_NAME } from '@sirubot/utils';
import { ApplicationIntegrationType, ButtonStyle, ChatInputCommandInteraction, MessageFlags } from 'discord.js';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'invite',
	description: '봇 초대 링크를 보여줘요.'
})
export class InviteCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '초대' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '봇 초대 링크를 보여줘요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const clientId = this.container.client.user?.id;
		if (!clientId) return;

		const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=3147776&scope=bot%20applications.commands`;
		const avatarUrl = this.container.client.user?.displayAvatarURL({ size: 256 }) ?? '';

		const containerComponent = createContainer();
		containerComponent.addSectionComponents((s) =>
			s
				.addTextDisplayComponents((t) => t.setContent(`### 🔗 ${BOT_NAME} 초대\n\n아래 버튼을 눌러 봇을 서버에 초대하세요!`))
				.setThumbnailAccessory((t) => t.setURL(avatarUrl))
				.setButtonAccessory((b) => b.setLabel('초대하기').setStyle(ButtonStyle.Link).setURL(inviteUrl))
		);

		await interaction.reply({
			components: [containerComponent],
			flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
		});
	}
}
