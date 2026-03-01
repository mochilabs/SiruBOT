import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, container } from '@sapphire/framework';
import { cyan, yellow } from 'colorette';
import { Interaction } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.InteractionCreate })
export class InteractionCreateDebug extends Listener {
	public override run(interaction: Interaction) {
		const user = `${interaction.user.username}[${cyan(interaction.user.id)}]`;
		const guild = interaction.guild ? `${interaction.guild.name}[${cyan(interaction.guild.id)}]` : 'DM';

		if (interaction.isButton()) {
			container.logger.debug(`[Interaction] ${yellow('Button')} ${cyan(interaction.customId)} by ${user} in ${guild}`);
		} else if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu() || interaction.isChannelSelectMenu()) {
			container.logger.debug(
				`[Interaction] ${yellow('SelectMenu')} ${cyan(interaction.customId)} values=[${interaction.values.join(', ')}] by ${user} in ${guild}`
			);
		} else if (interaction.isModalSubmit()) {
			container.logger.debug(`[Interaction] ${yellow('Modal')} ${cyan(interaction.customId)} by ${user} in ${guild}`);
		} else if (interaction.isChatInputCommand()) {
			const sub = interaction.options.getSubcommand(false);
			const cmdName = sub ? `${interaction.commandName} ${sub}` : interaction.commandName;
			container.logger.debug(`[Interaction] ${yellow('Command')} ${cyan(cmdName)} by ${user} in ${guild}`);
		} else if (interaction.isAutocomplete()) {
			// Autocomplete is too noisy, skip
		} else {
			container.logger.debug(`[Interaction] ${yellow(interaction.type.toString())} by ${user} in ${guild}`);
		}
	}
}
