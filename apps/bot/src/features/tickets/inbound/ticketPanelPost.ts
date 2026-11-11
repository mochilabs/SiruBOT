import { container } from '@sapphire/framework';
import type { Guild } from 'discord.js';
import { deletePostedMessage, PanelPostError, resolvePanelChannel } from '../../role-panels/index.ts';
import { ticketPanelView } from '../discord/views/ticket.ts';

/**
 * 대시보드 직접 게시 — 티켓 패널을 게시하고 DB에 channelId/messageId를 기록해요.
 * 티켓은 길드당 설정 하나라 panelId가 없어요. 실패(기능 꺼짐·채널 없음)는 PanelPostError로 던져
 * 게시 응답자(features/dashboard-bridge)가 한국어 error로 응답해요.
 */
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
	// 새 패널을 기록한 뒤 이전 패널 메시지를 지워 채널에 중복 패널이 남지 않게 해요.
	if (config.panelMessageId && config.panelMessageId !== message.id) {
		await deletePostedMessage(guild, config.panelChannelId, config.panelMessageId);
	}
	return { messageId: message.id, channelId: channel.id };
}
