import { container } from '@sapphire/framework';
import { botInfoView } from '../view/botInfo.ts';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { formatDayHourMinute } from '../utils/uptime.ts';

export const name = 'bot';
export const ko = '봇';
export const description = '봇 정보와 통계를 보여줘요.';
/** en-US 기본 설명 (기본 로케일이 영어예요) */
export const descriptionEn = 'Show bot information and stats.';
export const preconditions: string[] = [];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub.setName(name).setNameLocalizations({ ko }).setDescription(descriptionEn).setDescriptionLocalizations({ ko: description });
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

	const containerComponent = botInfoView({ guilds, users, players, channels, heapUsedMB, heapTotalMB, uptimeStr, shardInfo, latency });

	await interaction.editReply({
		components: [containerComponent],
		flags: [MessageFlags.IsComponentsV2]
	});
}
