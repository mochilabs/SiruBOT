import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Collection, Message, PartialMessage, ReadonlyCollection, Snowflake } from 'discord.js';

/** 원문이 지워지면 스타보드 글도 지워요 (한 건 삭제). 절대 throw하지 않아요. */
@ApplyOptions<Listener.Options>({ name: 'starboardSourceDeleted', event: Events.MessageDelete })
export class StarboardSourceDeletedListener extends Listener {
	public override async run(message: Message | PartialMessage): Promise<void> {
		if (!message.guildId) return;
		await this.container.starboardService.handleSourcesDeleted(message.guildId, [message.id]);
	}
}

/** 메시지 일괄 삭제 — 청소 명령 등 */
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
