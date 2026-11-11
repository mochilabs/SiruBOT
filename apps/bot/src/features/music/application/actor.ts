import { PermissionFlagsBits, type GuildMember } from 'discord.js';

/**
 * 음악 제어를 요청한 사람 — 인가 정책이 필요로 하는 값만 담은 평범한 데이터예요.
 * 진입점(슬래시·버튼·대시보드·AI)이 각자 `Interaction`/`GuildMember`에서 만들어 유스케이스에 넘겨요.
 */
export interface Actor {
	guildId: string;
	userId: string;
	/** 요청자가 접속한 음성 채널 (미접속이면 null) */
	voiceChannelId: string | null;
	/** Administrator 권한 보유 여부 — 음성 채널 조건을 면제받는 유일한 경우예요 */
	isAdministrator: boolean;
	/** 요청자가 가진 역할 ID (DJ 역할 판정용) */
	roleIds: ReadonlySet<string>;
	/** 요청자의 음성 채널에 있는 봇이 아닌 참가자 수 (미접속이면 0) — '혼자 있을 때' 판정용 */
	humansInVoiceChannel: number;
}

/** discord.js 멤버에서 Actor를 만들어요. 호출 시점의 캐시 상태를 스냅샷으로 담아요. */
export function actorFromMember(member: GuildMember): Actor {
	const voiceChannel = member.voice.channel;
	return {
		guildId: member.guild.id,
		userId: member.id,
		voiceChannelId: member.voice.channelId,
		isAdministrator: member.permissions.has(PermissionFlagsBits.Administrator),
		roleIds: new Set(member.roles.cache.keys()),
		humansInVoiceChannel: voiceChannel ? voiceChannel.members.filter((voiceMember) => !voiceMember.user.bot).size : 0
	};
}
