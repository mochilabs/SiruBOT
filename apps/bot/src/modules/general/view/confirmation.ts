import { ButtonBuilder, ButtonStyle } from 'discord.js';
import { confirmId } from '../../../lib/confirmationId.ts';
import { notice } from './notice.ts';

export function confirmationView(sessionId: string, title: string, description: string) {
	return notice(`### ${title}\n${description}\n\n-# 1분 안에 선택해 주세요. 취소하거나 시간이 지나면 변경하지 않아요.`).addActionRowComponents(
		(row) =>
			row.addComponents(
				new ButtonBuilder().setCustomId(confirmId.encode('yes', { sessionId })).setLabel('확인하고 진행').setStyle(ButtonStyle.Danger),
				new ButtonBuilder().setCustomId(confirmId.encode('no', { sessionId })).setLabel('취소').setStyle(ButtonStyle.Secondary)
			)
	);
}
