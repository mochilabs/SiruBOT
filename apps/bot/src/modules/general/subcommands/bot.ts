import { container } from '@sapphire/framework';
import { emoji, BOT_NAME, createContainer, versionInfo } from '@sirubot/utils';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder, SeparatorSpacingSize } from 'discord.js';
import { formatDayHourMinute } from '../utils/uptime.ts';

export const name = 'bot';
export const ko = '봇';
export const description = '봇의 정보와 통계를 보여줘요.';
export const preconditions: string[] = [];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub.setName(name).setNameLocalizations({ ko }).setDescription(description).setDescriptionLocalizations({ ko: description });
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	await interaction.deferReply();

	const client = container.client;
	const guilds = client.guilds.cache.size;
	const users = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
	const players = container.audio?.players?.size ?? 0;
	const channels = client.channels.cache.size;

	const memUsage = process.memoryUsage();
	const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);
	const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(1);

	const uptimeStr = formatDayHourMinute(process.uptime());
	const shardInfo = client.shard ? `샤드 ${client.shard.ids.join(', ')} / 총 ${client.shard.count}개` : '샤딩 없음';
	const latency = Math.round(client.ws.ping);

	const containerComponent = createContainer();
	// About 헤더 — 봇 이름 + 태그라인 + 버전
	containerComponent.addTextDisplayComponents((t) =>
		t.setContent(
			`### ${emoji('robot')} ${BOT_NAME}\n` +
				`${emoji('sparkle')} 디스코드 음악 봇 — 재생·자동추천·믹서·가사를 지원해요.\n` +
				`-# ${emoji('box')} 버전 ${versionInfo.getVersion()} (\`${versionInfo.getGitHash()}\`)`
		)
	);
	containerComponent.addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small));
	// 지표 블록
	containerComponent.addTextDisplayComponents((t) =>
		t.setContent(
			[
				`${emoji('chart')} **서버** ${guilds.toLocaleString()}개  •  **유저** ${users.toLocaleString()}명`,
				`${emoji('music_note')} **활성 플레이어** ${players}개  •  **채널** ${channels.toLocaleString()}개`,
				`${emoji('disk')} **메모리** ${heapUsedMB}MB / ${heapTotalMB}MB  •  ${emoji('clock')} **업타임** ${uptimeStr}`,
				`${emoji('link')} **${shardInfo}**  •  ${emoji('radio_wave')} **지연** ${latency}ms`
			].join('\n')
		)
	);
	containerComponent.addSeparatorComponents((s) => s.setSpacing(SeparatorSpacingSize.Small));
	// About 푸터
	containerComponent.addTextDisplayComponents((t) => t.setContent(`-# ${emoji('heart')} ${BOT_NAME}와 함께해 주셔서 감사해요!`));

	await interaction.editReply({
		components: [containerComponent],
		flags: [MessageFlags.IsComponentsV2]
	});
}
