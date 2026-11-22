import { emoji, BOT_NAME, createContainer, versionInfo } from '@sirubot/utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SeparatorSpacingSize } from 'discord.js';
import { supportButton } from '../../lib/errorView.ts';

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

export interface BotInfoLinks {
	/** null이면 상태 페이지 버튼을 숨겨요 (D-4) */
	dashboardUrl: string | null;
	/** null이면 지원 서버 버튼을 숨겨요 */
	supportServerUrl: string | null;
}

/** 링크 버튼 행 — 상태 페이지(`{dashboardUrl}/shards`)와 지원 서버. 둘 다 없으면 null이에요. */
function linkRow(links: BotInfoLinks): ActionRowBuilder<ButtonBuilder> | null {
	const row = new ActionRowBuilder<ButtonBuilder>();
	if (links.dashboardUrl) {
		row.addComponents(
			new ButtonBuilder().setURL(`${links.dashboardUrl}/shards`).setLabel('상태 페이지').setEmoji(emoji('chart')).setStyle(ButtonStyle.Link)
		);
	}
	if (links.supportServerUrl) row.addComponents(supportButton(links.supportServerUrl));
	return row.components.length > 0 ? row : null;
}

export function botInfoView(stats: BotInfoStats, links: BotInfoLinks = { dashboardUrl: null, supportServerUrl: null }) {
	const { guilds, users, players, channels, heapUsedMB, heapTotalMB, uptimeStr, shardInfo, latency } = stats;
	const view = createContainer()
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
	const row = linkRow(links);
	if (row) view.addActionRowComponents(row);
	return view;
}
