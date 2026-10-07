import { container } from '@sapphire/framework';
import { appEmoji, BOT_NAME, createContainer, versionInfo } from '@sirubot/utils';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';

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

	const uptimeSeconds = Math.floor(process.uptime());
	const days = Math.floor(uptimeSeconds / 86400);
	const hours = Math.floor((uptimeSeconds % 86400) / 3600);
	const minutes = Math.floor((uptimeSeconds % 3600) / 60);
	const uptimeStr = `${days}일 ${hours}시간 ${minutes}분`;

	const shardInfo = client.shard ? `샤드 ${client.shard.ids.join(', ')} / 총 ${client.shard.count}개` : '샤딩 없음';

	const lines = [
		`### ${appEmoji('robot', '🤖')} ${BOT_NAME} 정보`,
		``,
		`${appEmoji('chart', '📊')} **서버**: ${guilds.toLocaleString()}개 | **유저**: ${users.toLocaleString()}명`,
		`${appEmoji('music_note', '🎵')} **활성 플레이어**: ${players}개 | **채널**: ${channels.toLocaleString()}개`,
		`${appEmoji('disk', '💾')} **메모리**: ${heapUsedMB}MB / ${heapTotalMB}MB`,
		`${appEmoji('clock', '⏱️')} **업타임**: ${uptimeStr}`,
		`${appEmoji('link', '🔗')} **샤드**: ${shardInfo}`,
		`${appEmoji('box', '📦')} **버전**: ${versionInfo.getVersion()} (\`${versionInfo.getGitHash()}\`)`
	];

	const containerComponent = createContainer();
	containerComponent.addTextDisplayComponents((t) => t.setContent(lines.join('\n')));

	await interaction.editReply({
		components: [containerComponent],
		flags: [MessageFlags.IsComponentsV2]
	});
}
