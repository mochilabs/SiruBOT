import { container } from '@sapphire/framework';
import type { Guild } from 'discord.js';
import { deletePostedMessage, PanelPostError, resolvePanelChannel } from '../../role-panels/index.ts';
import { ticketPanelView } from '../discord/views/ticket.ts';

export async function postTicketPanel(guild: Guild, channelId: string | undefined): Promise<{ messageId: string; channelId: string }> {
	const config = await container.db.ticketConfig.findUnique({ where: { guildId: guild.id } });
	if (!config || !config.enabled) {
		throw new PanelPostError(`티켓 기능이 꺼져 있어요. 먼저 티켓을 활성화해 주세요.`);
	}
	const channel = resolvePanelChannel(guild, channelId ?? config.panelChannelId);
	if (!channel) {
		throw new PanelPostError(`게시할 텍스트 채널을 찾을 수 없어요. 채널을 선택해 주세요.`);
	}

	const message = await channel.send(ticketPanelView(config));
	await container.db.ticketConfig.update({
		where: { guildId: guild.id },
		data: { panelChannelId: channel.id, panelMessageId: message.id }
	});
	if (config.panelMessageId && config.panelMessageId !== message.id) {
		await deletePostedMessage(guild, config.panelChannelId, config.panelMessageId);
	}
	return { messageId: message.id, channelId: channel.id };
}
