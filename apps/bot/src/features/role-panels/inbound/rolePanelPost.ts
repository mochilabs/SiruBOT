import { container } from '@sapphire/framework';
import type { Guild } from 'discord.js';
import { PanelPostError } from '../application/rolePanelService.ts';

export async function postRolePanel(
	guild: Guild,
	request: { panelId?: string; channelId?: string; refresh?: boolean }
): Promise<{ messageId: string; channelId: string } | null> {
	if (!request.panelId) throw new PanelPostError(`게시할 역할 패널을 지정해 주세요.`);
	return container.rolePanelService.publishPanel(guild, request.panelId, request.channelId, { refresh: request.refresh === true });
}
