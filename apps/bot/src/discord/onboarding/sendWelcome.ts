import { container } from '@sapphire/framework';
import { usageFeatureKey } from '@sirubot/utils/modules';
import { ChannelType, MessageFlags, PermissionFlagsBits, type Guild, type GuildBasedChannel, type GuildMember, type TextChannel } from 'discord.js';
import { getConfig } from '../../lib/config.ts';
import type { JoinKind } from '../../services/guildLifecycle.ts';
import { fetchCommandIndex } from '../utils/commandMentions.ts';
import { welcomeView } from '../views/welcome.ts';
import { pickWelcomeTarget, type WelcomeChannelCandidate } from './welcomeTarget.ts';

function canSend(channel: GuildBasedChannel | null | undefined, me: GuildMember): boolean {
	if (!channel || !channel.isSendable()) return false;
	return channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) ?? false;
}

/** 채널 목록 화면 순서: 카테고리 위치, 그 안의 채널 위치 */
function sortedTextChannels(guild: Guild): TextChannel[] {
	return [...guild.channels.cache.values()]
		.filter((c): c is TextChannel => c.type === ChannelType.GuildText)
		.sort((a, b) => (a.parent?.rawPosition ?? -1) - (b.parent?.rawPosition ?? -1) || a.rawPosition - b.rawPosition);
}

function candidates(guild: Guild, me: GuildMember): WelcomeChannelCandidate[] {
	const list: WelcomeChannelCandidate[] = [];
	if (guild.systemChannel) list.push({ id: guild.systemChannel.id, kind: 'system', canSend: canSend(guild.systemChannel, me) });
	if (guild.publicUpdatesChannel) {
		list.push({ id: guild.publicUpdatesChannel.id, kind: 'publicUpdates', canSend: canSend(guild.publicUpdatesChannel, me) });
	}
	for (const channel of sortedTextChannels(guild)) list.push({ id: channel.id, kind: 'text', canSend: canSend(channel, me) });
	return list;
}

/**
 * 서버 가입 안내를 보내요 (P-02). 보낼 곳은 `pickWelcomeTarget` 순서이고, 채널이 없으면 서버 주인 DM을 한 번만 시도해요.
 * 실패해도 다시 시도하지 않아요 (대량 초대 때 스팸처럼 보이지 않게). 보냈으면 true.
 */
export async function sendWelcome(guild: Guild, kind: Exclude<JoinKind, 'skip'>): Promise<boolean> {
	const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
	if (!me) return false;
	const { links } = getConfig();
	const payload = {
		components: [
			welcomeView({
				kind,
				index: await fetchCommandIndex(guild.id),
				dashboardUrl: links.dashboardUrl,
				supportServerUrl: links.supportServerUrl
			})
		],
		flags: MessageFlags.IsComponentsV2 as const,
		allowedMentions: { parse: [] }
	};

	const target = pickWelcomeTarget(candidates(guild, me));
	try {
		if (target.type === 'channel') {
			const channel = guild.channels.cache.get(target.channelId);
			if (!channel?.isSendable()) return false;
			await channel.send(payload);
		} else {
			const owner = await guild.fetchOwner();
			await owner.send(payload);
		}
	} catch (error) {
		container.logger.warn(`[onboarding] 안내를 보내지 못했어요 (guild ${guild.id}, ${target.type}): ${error}`);
		return false;
	}
	container.usageRecorder?.record(guild.id, usageFeatureKey('onboarding', 'sent'));
	return true;
}
