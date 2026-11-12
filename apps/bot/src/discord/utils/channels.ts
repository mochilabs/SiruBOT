import { ChannelType, type Guild } from 'discord.js';

/**
 * 현재 채널을 뺀 서버의 텍스트 채널 ID 목록: 끄기(all → channels)로 남길 허용 채널을
 * 만들 때 쓰는 공용 수집기예요 (/채팅설정·/tts·/채팅유틸이 같은 조건을 씁니다).
 */
export function collectOtherTextChannelIds(guild: Guild, currentChannelId: string): string[] {
	return guild.channels.cache
		.filter(
			(channel) => channel.id !== currentChannelId && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
		)
		.map((channel) => channel.id);
}
