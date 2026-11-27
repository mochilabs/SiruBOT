import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction } from 'discord.js';
import * as avatar from '../subcommands/avatar.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'avatar',
	description: avatar.description,
	fullCategory: ['일반']
})
export class AvatarCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: avatar.ko })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: avatar.description });
			avatar.withOptions(builder);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'avatar_not_in_guild',
				message: `${emoji('error')} 길드 안에서만 사용할 수 있어요.`,
				context: { ephemeral: true }
			});
		}

		await avatar.run(interaction);
	}
}
