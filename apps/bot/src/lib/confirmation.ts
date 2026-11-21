import { emoji } from '@sirubot/utils';
import { randomUUID } from 'node:crypto';
import { ComponentType, MessageFlags, type ContainerBuilder, type Message } from 'discord.js';
import { confirmationView } from './confirmationView.ts';
import { confirmId } from './confirmationId.ts';
import { ownerOnly } from './ownerOnlyFilter.ts';
import { notice } from './notice.ts';

/**
 * 확인 창을 띄울 화면 — 슬래시 명령 상호작용이 그대로 들어맞고, 상호작용이 없는 진입점(멘션 답변)은
 * 자기 라이브 메시지를 `editReply`로 감싸 넘겨요. `user`만 버튼을 누를 수 있어요.
 */
export interface ConfirmationSurface {
	user: { id: string };
	editReply(options: { components: ContainerBuilder[]; flags: MessageFlags.IsComponentsV2[]; allowedMentions?: { parse: [] } }): Promise<Message>;
}

export async function confirmAction(interaction: ConfirmationSurface, title: string, description: string): Promise<boolean> {
	const sessionId = randomUUID();
	const message = await interaction.editReply({
		components: [confirmationView(sessionId, title, description)],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { parse: [] }
	});
	let selection;
	try {
		selection = await message.awaitMessageComponent({
			componentType: ComponentType.Button,
			time: 60_000,
			filter: ownerOnly(interaction.user.id, (button) => confirmId.decode(button.customId)?.sessionId === sessionId)
		});
	} catch {
		await interaction
			.editReply({
				components: [notice(`${emoji('info')} 시간이 지나 취소했어요. 변경한 내용은 없어요.`)],
				flags: [MessageFlags.IsComponentsV2]
			})
			.catch(() => undefined);
		return false;
	}
	const confirmed = confirmId.decode(selection.customId)?.action === 'yes';
	await selection.update({
		components: [notice(confirmed ? '처리 중이에요…' : '취소했어요. 변경한 내용은 없어요.')],
		flags: [MessageFlags.IsComponentsV2]
	});
	return confirmed;
}
