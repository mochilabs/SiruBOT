import { container, Events, Listener } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { MessageFlags, type MessageReaction, type PartialMessageReaction, type PartialUser, type User } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { notice } from '../../view/notice.ts';
import { rolePanelEmojiKey } from '@sirubot/utils/rolePanel';

/** 같은 유저의 연속 반응(추가→제거)이 뒤섞이지 않게 (길드, 유저) 단위로 순서를 보장하는 큐. */
const queues = new Map<string, Promise<void>>();

function enqueue(key: string, task: () => Promise<void>): Promise<void> {
	const previous = queues.get(key) ?? Promise.resolve();
	const next = previous.then(task, task).finally(() => {
		if (queues.get(key) === next) queues.delete(key);
	});
	queues.set(key, next);
	return next;
}

/** 봇이 직접 지운 반응(검증 실패 정리)은 사용자의 "해제"가 아니므로 제거 이벤트에서 건너뛰어요. */
const selfRemoved = new Set<string>();

type ReactionAction = 'grant' | 'revoke';

/**
 * 반응 모드 역할 패널 처리.
 *
 * - 반응 추가 → 역할 부여, 반응 제거 → 역할 해제 (버튼과 같은 `isRoleAssignable` 검증을 거쳐요).
 * - DB가 진실의 원천이에요: 길드·게시 메시지·이모지→역할 매핑을 모두 DB 패널에서 읽어요.
 * - 부여에 실패하면 사유를 DM으로 알리고(막혀 있으면 조용히 넘어가요) 방금 단 반응을 치워요.
 * - 절대 throw하지 않아요 — 일반 메시지 반응 이벤트 흐름을 건드리지 않게요.
 */
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

@ApplyOptions<Listener.Options>({ event: Events.MessageReactionAdd })
export class RolePanelReactionAddListener extends Listener {
	public override run(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
		return enqueue(`${reaction.message.guildId}:${user.id}`, () => handleReaction(reaction, user, 'grant'));
	}
}

@ApplyOptions<Listener.Options>({ event: Events.MessageReactionRemove })
export class RolePanelReactionRemoveListener extends Listener {
	public override run(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
		return enqueue(`${reaction.message.guildId}:${user.id}`, () => handleReaction(reaction, user, 'revoke'));
	}
}
