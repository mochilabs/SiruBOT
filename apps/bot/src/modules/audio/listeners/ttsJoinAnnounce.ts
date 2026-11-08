import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { VoiceState } from 'discord.js';
import { truncateText } from '../../../lib/text.ts';
import type { CustomPlayer } from '../lavalink/player/customPlayer.ts';

/** 읽을 이름 상한 — 긴 닉네임이 안내를 늘리지 않게 자른다 */
const JOIN_NAME_MAX_CHARS = 20;

/**
 * 음성 채널 입장 알림 — 봇이 있는 음성 채널에 사용자가 들어오면 "OO님이 입장했어요"를 읽는다.
 * 길드 설정(`/tts 입장알림`)이 켜져 있고 TTS 서버가 연결돼 있을 때만 동작한다.
 * 입장한 사용자의 음성·위치 프리셋으로 읽으며, 낭독 opt-in 여부는 보지 않는다.
 * 실패는 조용히 넘긴다(자동 안내라 채널 공지 없음).
 */
@ApplyOptions<Listener.Options>({
	event: Events.VoiceStateUpdate
})
export class TtsJoinAnnounceListener extends Listener {
	public override async run(oldState: VoiceState, newState: VoiceState): Promise<void> {
		try {
			await this.handle(oldState, newState);
		} catch (error) {
			this.container.logger.warn(`[ttsJoin] 입장 알림 실패 (guild ${newState.guild.id}): ${error}`);
		}
	}

	private async handle(oldState: VoiceState, newState: VoiceState): Promise<void> {
		const member = newState.member;
		if (!member || member.user.bot) return;
		// 같은 채널 안의 상태 변화(음소거 등)와 퇴장은 제외한다
		if (!newState.channelId || oldState.channelId === newState.channelId) return;

		const guildId = newState.guild.id;
		const player = this.container.audio.getPlayer(guildId) as CustomPlayer | null | undefined;
		if (!player?.connected || player.voiceChannelId !== newState.channelId) return;

		if (!this.container.ttsService.isEnabled()) return;
		if (!(await this.container.guildService.getTtsJoinAnnounce(guildId))) return;

		const preset = await this.container.ttsUserSettings.get(guildId, member.id);
		const name = truncateText(member.displayName.replace(/\s+/g, ' ').trim(), JOIN_NAME_MAX_CHARS);
		await this.container.chatTtsService.speakNow(player, `${name}님이 입장했어요`, preset);
	}
}
