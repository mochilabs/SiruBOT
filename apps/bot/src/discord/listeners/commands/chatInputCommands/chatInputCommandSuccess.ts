import { ApplyOptions } from '@sapphire/decorators';
import { type ChatInputCommandSuccessPayload, Events, Listener, container } from '@sapphire/framework';
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
	}
}
