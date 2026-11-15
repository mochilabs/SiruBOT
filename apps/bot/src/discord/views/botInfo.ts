import { emoji, BOT_NAME, createContainer, versionInfo } from '@sirubot/utils';
import { SeparatorSpacingSize } from 'discord.js';

export type BotInfoStats = {
	guilds: number;
	users: number;
	players: number;
	channels: number;
	heapUsedMB: string;
	heapTotalMB: string;
	uptimeStr: string;
	shardInfo: string;
	latency: number;
};

export function botInfoView(stats: BotInfoStats) {
	const { guilds, users, players, channels, heapUsedMB, heapTotalMB, uptimeStr, shardInfo, latency } = stats;
	return createContainer()
		.addTextDisplayComponents((t) =>
			t.setContent(
				`### ${emoji('robot')} ${BOT_NAME}\n` +
					`${emoji('sparkle')} 디스코드 음악 봇 — 재생·자동추천·믹서·가사를 지원해요.\n` +
					`-# ${emoji('box')} 버전 ${versionInfo.getVersion()} (\`${versionInfo.getGitHash()}\`)`
			)
		)
		.addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
		.addTextDisplayComponents((t) =>
			t.setContent(
				[
					`${emoji('chart')} **서버** ${guilds.toLocaleString()}개  •  **유저** ${users.toLocaleString()}명`,
					`${emoji('music_note')} **활성 플레이어** ${players}개  •  **채널** ${channels.toLocaleString()}개`,
					`${emoji('disk')} **메모리** ${heapUsedMB}MB / ${heapTotalMB}MB  •  ${emoji('clock')} **업타임** ${uptimeStr}`,
					`${emoji('link')} **${shardInfo}**  •  ${emoji('radio_wave')} **지연** ${latency}ms`
				].join('\n')
			)
		)
		.addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small))
		.addTextDisplayComponents((t) => t.setContent(`-# ${emoji('heart')} ${BOT_NAME}와 함께해 주셔서 감사해요!`));
}
