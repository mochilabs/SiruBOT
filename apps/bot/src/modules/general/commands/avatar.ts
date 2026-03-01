import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	MessageFlags,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	TextDisplayBuilder
} from 'discord.js';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'avatar',
	description: '사용자의 아바타를 보여줘요.'
})
export class AvatarCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '아바타' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '유저의 아바타를 보여줘요.' })
				.addUserOption((option) =>
					option
						.setName('user')
						.setNameLocalizations({ ko: '유저' })
						.setDescription('The user whose avatar to show.')
						.setDescriptionLocalizations({ ko: '아바타를 확인할 유저에요.' })
				)
				.addBooleanOption((option) =>
					option
						.setName('server')
						.setNameLocalizations({ ko: '서버아바타' })
						.setDescription('Show server-specific avatar if available.')
						.setDescriptionLocalizations({ ko: '서버 아바타가 있으면 서버 아바타를 보여줘요.' })
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const user = interaction.options.getUser('user') ?? interaction.user;
		const showServerAvatar = interaction.options.getBoolean('server') ?? false;
		const member = interaction.guild.members.cache.get(user.id);

		let avatarUrl: string;
		let label: string;

		if (showServerAvatar && member?.avatar) {
			avatarUrl = member.displayAvatarURL({ size: 4096 });
			label = `${user.tag}의 서버 아바타`;
		} else {
			avatarUrl = user.displayAvatarURL({ size: 4096 });
			label = `${user.tag}의 아바타`;
		}

		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🖼️ ${label}`));

		const gallery = new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(avatarUrl));
		containerComponent.addMediaGalleryComponents(gallery);

		await interaction.reply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
