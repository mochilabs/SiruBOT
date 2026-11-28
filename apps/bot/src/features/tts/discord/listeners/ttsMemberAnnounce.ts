import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { VoiceState } from 'discord.js';
import { truncateText } from '../../../../lib/text.ts';
import type { CustomPlayer } from '../../../music/index.ts';
import * as guildChatPolicy from '../../../../services/guildSettings/chatPolicy.ts';
import { isMessageFeatureEnabled } from '../../../../services/guildSettings/modules.ts';

const ANNOUNCE_NAME_MAX_CHARS = 20;

@ApplyOptions<Listener.Options>({
	event: Events.VoiceStateUpdate
})
export class TtsMemberAnnounceListener extends Listener {
	public override async run(oldState: VoiceState, newState: VoiceState): Promise<void> {
		try {
			await this.handle(oldState, newState);
		} catch (error) {
			this.container.logger.warn(`[ttsAnnounce] 입·퇴장 알림 실패 (guild ${newState.guild.id}): ${error}`);
		}
	}

	private async handle(oldState: VoiceState, newState: VoiceState): Promise<void> {
		const member = newState.member ?? oldState.member;
		if (!member || member.user.bot) return;
		// 같은 채널 안의 상태 변화(음소거 등)는 제외한다
		if (oldState.channelId === newState.channelId) return;

		const guildId = newState.guild.id;
		const player = this.container.audio.getPlayer(guildId) as CustomPlayer | null | undefined;
		if (!player?.connected || !player.voiceChannelId) return;

		const joined = newState.channelId === player.voiceChannelId;
		const left = oldState.channelId === player.voiceChannelId;
		if (!joined && !left) return;

		if (!this.container.ttsService.isEnabled()) return;
		if (!(await isMessageFeatureEnabled(this.container.guildService, guildId, 'chat-tts'))) return;
		const enabled = joined
			? await guildChatPolicy.getTtsJoinAnnounce(this.container.guildService, guildId)
			: await guildChatPolicy.getTtsLeaveAnnounce(this.container.guildService, guildId);
		if (!enabled) return;

		const preset = await this.container.ttsUserSettings.get(guildId, member.id);
		const name = truncateText(member.displayName.replace(/\s+/g, ' ').trim(), ANNOUNCE_NAME_MAX_CHARS);
		await this.container.chatTtsService.speakNow(player, `${name}님이 ${joined ? '입장' : '퇴장'}했어요`, preset);
	}
}
