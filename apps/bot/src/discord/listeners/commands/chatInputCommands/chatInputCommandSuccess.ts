import { ApplyOptions } from '@sapphire/decorators';
import { type ChatInputCommandSuccessPayload, Events, Listener, container } from '@sapphire/framework';
import { usageFeatureKey } from '@sirubot/utils/modules';
import { cyan } from 'colorette';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandSuccess })
export class ChatInputCommandSuccess extends Listener {
	public override run(payload: ChatInputCommandSuccessPayload): void {
		const { interaction, command } = payload;
		const guild = interaction.guild;
		const shard = `[${cyan(String(guild?.shardId ?? 0))}]`;
		const author = `${interaction.user.username}[${cyan(interaction.user.id)}]`;
		const sentAt = guild ? `${guild.name}[${cyan(guild.id)}]` : 'Direct Messages';
		container.logger.debug(`${shard} - ${cyan(command.name)} ${author} ${sentAt}`);

		const sub = interaction.options.getSubcommand(false);
		container.usageRecorder?.record(
			interaction.guildId,
			usageFeatureKey('cmd', sub ? `${command.name}.${sub}` : command.name),
			interaction.user.id
		);
	}
}
