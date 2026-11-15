import { container } from '@sapphire/framework';
import type { Guild } from 'discord.js';
import { PanelPostError } from '../application/rolePanelService.ts';

/**
 * 대시보드 직접 게시 — 역할 패널을 게시(또는 refresh면 제자리 갱신)하고 DB에 channelId/messageId를 기록해요.
 * 갱신할 게시물이 없어 아무것도 하지 않았다면 null이에요. 실패는 PanelPostError로 던져
 * 게시 응답자(features/dashboard-bridge)가 한국어 error로 응답해요.
 */
export async function postRolePanel(
	guild: Guild,
	request: { panelId?: string; channelId?: string; refresh?: boolean }
): Promise<{ messageId: string; channelId: string } | null> {
	if (!request.panelId) throw new PanelPostError(`게시할 역할 패널을 지정해 주세요.`);
	return container.rolePanelService.publishPanel(guild, request.panelId, request.channelId, { refresh: request.refresh === true });
}
