import { ApplyOptions } from '@sapphire/decorators';
import { Command, RegisterBehavior } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { emoji, createContainer } from '@sirubot/utils';
import { envParseArray } from '@skyra/env-utilities';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'shards',
	fullCategory: ['개발'],
	preconditions: ['OwnerOnly']
})
export class ShardsCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand(
			(builder) => {
				builder
					.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
					.setName(this.name)
					.setNameLocalizations({ ko: '샤드' })
					.setDescription('샤드 상태를 보여줘요. (봇 소유자 전용)');
			},
			{ guildIds: envParseArray('DEV_GUILD_IDS'), behaviorWhenNotIdentical: RegisterBehavior.Overwrite }
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true });

		const client = this.container.client;
		const shardClient = this.container.shardClient;

		const lines = [`${emoji('radio_wave')} 샤드 정보`, ''];

		if (client.ws.shards.size > 0) {
			for (const [id, shard] of client.ws.shards) {
				const statusEmoji = shard.status === 0 ? '🟢' : shard.status === 5 ? '🔴' : '🟡';
				const ping = shard.ping >= 0 ? `${shard.ping}ms` : 'N/A';
				lines.push(`${statusEmoji} **샤드 #${id}**: 핑 ${ping} | 상태 ${shard.status}`);
			}
		} else {
			lines.push(`${emoji('chart')} **로컬 샤드**: 0 (싱글 프로세스)`);
		}

		lines.push('');

		if (shardClient) {
			lines.push(`${emoji('link')} **샤드 매니저 연결**: 활성`);
			lines.push(`${emoji('box')} **할당된 샤드**: ${client.options.shards?.toString() ?? 'auto'}`);
			lines.push(`${emoji('chart')} **총 샤드 수**: ${client.options.shardCount ?? 1}`);
		} else {
			lines.push(`${emoji('radio_wave')} **샤드 매니저**: 미연결 (개발 모드)`);
		}

		// Guild & memory stats
		lines.push('');
		lines.push(`${emoji('house')} **서버**: ${client.guilds.cache.size}개`);
		lines.push(`${emoji('music_note')} **플레이어**: ${this.container.audio?.players?.size ?? 0}개`);
		lines.push(`${emoji('disk')} **메모리**: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB`);

		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

		await interaction.editReply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
