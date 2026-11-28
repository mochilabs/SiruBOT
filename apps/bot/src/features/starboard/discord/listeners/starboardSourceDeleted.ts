import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Collection, Message, PartialMessage, ReadonlyCollection, Snowflake } from 'discord.js';

@ApplyOptions<Listener.Options>({ name: 'starboardSourceDeleted', event: Events.MessageDelete })
export class StarboardSourceDeletedListener extends Listener {
	public override async run(message: Message | PartialMessage): Promise<void> {
		if (!message.guildId) return;
		await this.container.starboardService.handleSourcesDeleted(message.guildId, [message.id]);
	}
}

@ApplyOptions<Listener.Options>({ name: 'starboardSourceBulkDeleted', event: Events.MessageBulkDelete })
export class StarboardSourceBulkDeletedListener extends Listener {
	public override async run(
		messages: ReadonlyCollection<Snowflake, Message | PartialMessage> | Collection<Snowflake, Message | PartialMessage>
	): Promise<void> {
		const guildId = messages.first()?.guildId;
		if (!guildId) return;
		await this.container.starboardService.handleSourcesDeleted(guildId, [...messages.keys()]);
	}
}
