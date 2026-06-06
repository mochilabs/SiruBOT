import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, container } from '@sapphire/framework';
import { Interaction } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.InteractionCreate })
export class InteractionCreateDebug extends Listener {
	public override run(interaction: Interaction) {
		const meta = {
			user_id: interaction.user.id,
			user_name: interaction.user.username,
			guild_id: interaction.guildId ?? 'DM'
		};

		if (interaction.isButton()) {
			container.logger.info('interaction.button', { ...meta, custom_id: interaction.customId });
		} else if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu() || interaction.isChannelSelectMenu()) {
			container.logger.info('interaction.select_menu', { ...meta, custom_id: interaction.customId, values: interaction.values });
		} else if (interaction.isModalSubmit()) {
			container.logger.info('interaction.modal', { ...meta, custom_id: interaction.customId });
		} else if (interaction.isChatInputCommand()) {
			const sub = interaction.options.getSubcommand(false);
			const cmdName = sub ? `${interaction.commandName} ${sub}` : interaction.commandName;
			container.logger.info('interaction.command', { ...meta, command_name: cmdName });
		} else if (interaction.isAutocomplete()) {
			// Autocomplete is too noisy, skip
		} else {
			container.logger.info('interaction.unknown', { ...meta, type: interaction.type.toString() });
		}
	}
}
