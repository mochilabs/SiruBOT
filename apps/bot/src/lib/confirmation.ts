import { randomUUID } from 'node:crypto';
import { ComponentType, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { confirmationView } from '../modules/general/view/confirmation.ts';
import { notice } from '../modules/general/view/notice.ts';

export async function confirmAction(interaction: ChatInputCommandInteraction, title: string, description: string): Promise<boolean> {
	const id = `confirm:${randomUUID()}`;
	const message = await interaction.editReply({
		components: [confirmationView(id, title, description)],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { parse: [] }
	});
	let selection;
	try {
		selection = await message.awaitMessageComponent({
			componentType: ComponentType.Button,
			time: 60_000,
			filter: (button) => button.user.id === interaction.user.id && button.customId.startsWith(`${id}:`)
		});
	} catch {
		await interaction
			.editReply({ components: [notice('시간이 지나 취소했어요. 변경한 내용은 없어요.')], flags: [MessageFlags.IsComponentsV2] })
			.catch(() => undefined);
		return false;
	}
	const confirmed = selection.customId === `${id}:yes`;
	await selection.update({
		components: [notice(confirmed ? '처리 중이에요…' : '취소했어요. 변경한 내용은 없어요.')],
		flags: [MessageFlags.IsComponentsV2]
	});
	return confirmed;
}
