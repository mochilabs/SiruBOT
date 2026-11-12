import { emoji } from '@sirubot/utils';
import { randomUUID } from 'node:crypto';
import { ComponentType, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { confirmationView } from './confirmationView.ts';
import { confirmId } from './confirmationId.ts';
import { ownerOnly } from './ownerOnlyFilter.ts';
import { notice } from './notice.ts';

export async function confirmAction(interaction: ChatInputCommandInteraction, title: string, description: string): Promise<boolean> {
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
