import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Message, MessageReaction, PartialMessage, PartialMessageReaction, PartialUser, User } from 'discord.js';

// 한 파일에 리스너가 여럿이라 이름을 따로 줘요 (이름이 같으면 Sapphire가 앞의 것을 unload해요)
async function scheduleFor(
	container: Listener['container'],
	message: Message | PartialMessage,
	emoji?: { id: string | null; name: string | null }
): Promise<void> {
	if (!message.guildId) return;
	try {
		await container.starboardService.schedule({ guildId: message.guildId, channelId: message.channelId, messageId: message.id }, emoji);
	} catch (error) {
		container.logger.warn(`[starboard] 예약 실패: ${error instanceof Error ? error.message : String(error)}`);
	}
}

@ApplyOptions<Listener.Options>({ name: 'starboardReactionAdd', event: Events.MessageReactionAdd })
export class StarboardReactionAddListener extends Listener {
	public override run(reaction: MessageReaction | PartialMessageReaction, _user: User | PartialUser): Promise<void> {
		return scheduleFor(this.container, reaction.message, reaction.emoji);
	}
}

@ApplyOptions<Listener.Options>({ name: 'starboardReactionRemove', event: Events.MessageReactionRemove })
export class StarboardReactionRemoveListener extends Listener {
	public override run(reaction: MessageReaction | PartialMessageReaction, _user: User | PartialUser): Promise<void> {
		return scheduleFor(this.container, reaction.message, reaction.emoji);
	}
}

@ApplyOptions<Listener.Options>({ name: 'starboardReactionRemoveEmoji', event: Events.MessageReactionRemoveEmoji })
export class StarboardReactionRemoveEmojiListener extends Listener {
	public override run(reaction: MessageReaction | PartialMessageReaction): Promise<void> {
		return scheduleFor(this.container, reaction.message, reaction.emoji);
	}
}

@ApplyOptions<Listener.Options>({ name: 'starboardReactionRemoveAll', event: Events.MessageReactionRemoveAll })
export class StarboardReactionRemoveAllListener extends Listener {
	public override run(message: Message | PartialMessage): Promise<void> {
		return scheduleFor(this.container, message);
	}
}
