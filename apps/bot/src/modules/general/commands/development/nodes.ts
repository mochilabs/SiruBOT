import { ApplyOptions } from '@sapphire/decorators';
import { Command, RegisterBehavior } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { createContainer } from '@sirubot/utils';
import { envParseArray } from '@skyra/env-utilities';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: '노드',
	preconditions: ['OwnerOnly']
})
export class NodesCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand(
			(builder) => {
				builder
					.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
					.setName(this.name)
					.setDescription('Lavalink 노드 상태를 보여줘요. (봇 소유자 전용)');
			},
			{ guildIds: envParseArray('DEV_GUILD_IDS'), behaviorWhenNotIdentical: RegisterBehavior.Overwrite }
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true });

		const audio = this.container.audio;
		if (!audio) {
			await interaction.editReply({ content: '❌ 오디오 시스템이 초기화되지 않았어요.' });
			return;
		}

		const lines = ['### 🎛️ Lavalink 노드 상태', ''];

		const nodes = audio.nodeManager.nodes;
		if (nodes.size === 0) {
			lines.push('❌ 연결된 노드가 없어요.');
		} else {
			for (const [id, node] of nodes) {
				const statusEmoji = node.connected ? '🟢' : '🔴';
				const stats = node.stats;

				lines.push(`${statusEmoji} **${id}** — \`${node.options.host}:${node.options.port}\``);

				if (stats) {
					const cpuLoad = (stats.cpu?.lavalinkLoad * 100).toFixed(1);
					const memUsed = (stats.memory?.used / 1024 / 1024).toFixed(1);
					const memTotal = (stats.memory?.reservable / 1024 / 1024).toFixed(1);
					const players = stats.players ?? 0;
					const playingPlayers = stats.playingPlayers ?? 0;

					const uptimeSeconds = Math.floor((stats.uptime ?? 0) / 1000);
					const days = Math.floor(uptimeSeconds / 86400);
					const hours = Math.floor((uptimeSeconds % 86400) / 3600);
					const minutes = Math.floor((uptimeSeconds % 3600) / 60);

					lines.push(`  📊 플레이어: ${playingPlayers}/${players} | CPU: ${cpuLoad}%`);
					lines.push(`  💾 메모리: ${memUsed}MB / ${memTotal}MB`);
					lines.push(`  ⏱️ 업타임: ${days}일 ${hours}시간 ${minutes}분`);
				}

				lines.push('');
			}
		}

		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

		await interaction.editReply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
