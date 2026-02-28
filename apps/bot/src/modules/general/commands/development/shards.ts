import { ApplyOptions } from '@sapphire/decorators';
import { Command, RegisterBehavior } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { createContainer } from '@sirubot/utils';
import { envParseArray } from '@skyra/env-utilities';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: '샤드',
	preconditions: ['OwnerOnly']
})
export class ShardsCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand(
			(builder) => {
				builder
					.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
					.setName(this.name)
					.setDescription('샤드 상태를 보여줘요. (봇 소유자 전용)');
			},
			{ guildIds: envParseArray('DEV_GUILD_IDS'), behaviorWhenNotIdentical: RegisterBehavior.Overwrite }
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true });

		const client = this.container.client;
		const shardClient = this.container.shardClient;

		const lines = ['### 📡 샤드 정보', ''];

		// Local client shard info
		if (client.ws.shards.size > 0) {
			for (const [id, shard] of client.ws.shards) {
				const statusEmoji = shard.status === 0 ? '🟢' : shard.status === 5 ? '🔴' : '🟡';
				const ping = shard.ping >= 0 ? `${shard.ping}ms` : 'N/A';
				lines.push(`${statusEmoji} **Shard #${id}** — Ping: ${ping} | Status: ${shard.status}`);
			}
		} else {
			lines.push('📊 **로컬 샤드**: 0 (싱글 프로세스)');
		}

		lines.push('');

		// Shard manager info
		if (shardClient) {
			lines.push(`🔗 **샤드 매니저 연결**: 활성`);
			lines.push(`📦 **할당된 샤드**: ${client.options.shards?.toString() ?? 'auto'}`);
			lines.push(`📊 **총 샤드 수**: ${client.options.shardCount ?? 1}`);
		} else {
			lines.push('📡 **샤드 매니저**: 미연결 (개발 모드)');
		}

		// Guild & memory stats
		lines.push('');
		lines.push(`🏠 **서버**: ${client.guilds.cache.size}개`);
		lines.push(`🎵 **플레이어**: ${this.container.audio?.players?.size ?? 0}개`);
		lines.push(`💾 **메모리**: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB`);

		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

		await interaction.editReply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
