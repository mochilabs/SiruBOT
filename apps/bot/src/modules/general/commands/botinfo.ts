import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { createContainer, versionInfo, BOT_NAME } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'botinfo',
	description: '봇의 정보와 통계를 보여줘요.'
})
export class BotInfoCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '봇정보' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '봇의 정보와 통계를 보여줘요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		await interaction.deferReply();

		const client = this.container.client;
		const guilds = client.guilds.cache.size;
		const users = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
		const players = this.container.audio?.players?.size ?? 0;
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
			`### 🤖 ${BOT_NAME} 정보`,
			``,
			`📊 **서버**: ${guilds.toLocaleString()}개 | **유저**: ${users.toLocaleString()}명`,
			`🎵 **활성 플레이어**: ${players}개 | **채널**: ${channels.toLocaleString()}개`,
			`💾 **메모리**: ${heapUsedMB}MB / ${heapTotalMB}MB`,
			`⏱️ **업타임**: ${uptimeStr}`,
			`🔗 **샤드**: ${shardInfo}`,
			`📦 **버전**: ${versionInfo.getVersion()} (\`${versionInfo.getGitHash()}\`)`
		];

		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents((t) => t.setContent(lines.join('\n')));

		await interaction.editReply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
