import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { createContainer, DEFAULT_COLOR } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'help',
	description: '사용 가능한 명령어 목록을 보여줘요.'
})
export class HelpCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '도움말' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '사용 가능한 명령어 목록을 보여줘요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const commands = this.container.stores.get('commands');

		const audioCommands: string[] = [];
		const generalCommands: string[] = [];

		for (const [, cmd] of commands) {
			const mention = `</${cmd.name}:0>`;
			const desc = cmd.description;
			const line = `${mention} — ${desc}`;

			if (cmd.fullCategory.includes('음악')) {
				audioCommands.push(line);
			} else {
				const isOwnerOnly = (cmd.options.preconditions as string[] | undefined)?.includes('OwnerOnly');
				if (!isOwnerOnly) {
					generalCommands.push(line);
				}
			}
		}

		const lines = ['### 📋 명령어 목록', '', '**🎵 오디오**', ...audioCommands, '', '**🛠️ 일반**', ...generalCommands];

		const containerComponent = createContainer();
		containerComponent.setAccentColor(DEFAULT_COLOR);
		containerComponent.addTextDisplayComponents((t) => t.setContent(lines.join('\n')));

		await interaction.reply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
		});
	}
}
