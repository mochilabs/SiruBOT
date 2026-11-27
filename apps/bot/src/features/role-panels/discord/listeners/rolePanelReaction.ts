import { container, Events, Listener } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { MessageFlags, type MessageReaction, type PartialMessageReaction, type PartialUser, type User } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { notice } from '../../../../lib/notice.ts';
import { rolePanelEmojiKey } from '@sirubot/utils/rolePanel';

/** 같은 유저의 연속 반응(추가/제거) 순서를 (길드, 유저) 단위로 직렬화해요. */
const queues = new Map<string, Promise<void>>();

function enqueue(key: string, task: () => Promise<void>): Promise<void> {
	const previous = queues.get(key) ?? Promise.resolve();
	const next = previous.then(task, task).finally(() => {
		if (queues.get(key) === next) queues.delete(key);
	});
	queues.set(key, next);
	return next;
}

/** 봇이 검증 실패로 지운 반응은 사용자 해제로 취급하지 않아요. */
const selfRemoved = new Set<string>();

type ReactionAction = 'grant' | 'revoke';

async function handleReaction(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser, action: ReactionAction): Promise<void> {
	if (user.bot) return;
	try {
		const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
		const guild = message.guild;
		if (!guild) return;

		const panel = await container.rolePanelService.findReactionPanel(guild.id, message.id);
		if (!panel) return;

		const resolved = reaction.partial ? await reaction.fetch() : reaction;
		const key = rolePanelEmojiKey(resolved.emoji.id ? `<:x_x:${resolved.emoji.id}>` : (resolved.emoji.name ?? ''));
		const button = panel.buttons.find((candidate) => candidate.emoji && rolePanelEmojiKey(candidate.emoji) === key);

		const selfKey = `${message.id}:${user.id}:${key}`;
		if (!button) {
			// 패널에 없는 이모지로 단 반응은 치워서 패널이 어지러워지지 않게 해요.
			if (action === 'grant') {
				selfRemoved.add(selfKey);
				await resolved.users.remove(user.id).catch(() => selfRemoved.delete(selfKey));
			}
			return;
		}
		if (action === 'revoke' && selfRemoved.delete(selfKey)) return;

		const member = await guild.members.fetch(user.id).catch(() => null);
		if (!member) return;

		const result = await container.rolePanelService.applyRole(guild, member, panel.id, button.roleId, action);
		if (result.ok || action === 'revoke') return;

		selfRemoved.add(selfKey);
		await resolved.users.remove(user.id).catch(() => selfRemoved.delete(selfKey));
		await user
			.send({
				components: [notice(`${emoji('error')} **${guild.name}** 역할 패널: ${result.reason}`)],
				flags: [MessageFlags.IsComponentsV2]
			})
			.catch(() => null);
	} catch (error) {
		container.logger.warn(`[rolePanel] reaction ${action} failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

// 한 파일에 리스너가 둘이라 이름을 따로 줘요 — 이름이 같으면 나중에 로드된 쪽이 앞의 쪽을 unload해요 (Sapphire Store.insert).
@ApplyOptions<Listener.Options>({ name: 'rolePanelReactionAdd', event: Events.MessageReactionAdd })
export class RolePanelReactionAddListener extends Listener {
	public override run(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
		return enqueue(`${reaction.message.guildId}:${user.id}`, () => handleReaction(reaction, user, 'grant'));
	}
}

@ApplyOptions<Listener.Options>({ name: 'rolePanelReactionRemove', event: Events.MessageReactionRemove })
export class RolePanelReactionRemoveListener extends Listener {
	public override run(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
		return enqueue(`${reaction.message.guildId}:${user.id}`, () => handleReaction(reaction, user, 'revoke'));
	}
}
