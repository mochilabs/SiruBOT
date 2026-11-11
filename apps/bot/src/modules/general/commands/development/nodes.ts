import { notice } from '../../view/notice.ts';
import { ApplyOptions } from '@sapphire/decorators';
import { Command, RegisterBehavior } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { getConfig } from '../../../../lib/configAccess.ts';
import { formatDayHourMinute } from '../../utils/uptime.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'nodes',
	fullCategory: ['개발'],
	preconditions: ['OwnerOnly']
})
export class NodesCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand(
			(builder) => {
				builder
					.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
					.setName(this.name)
					.setNameLocalizations({ ko: '노드' })
					.setDescription('Show Lavalink node status (bot owner only).')
					.setDescriptionLocalizations({ ko: 'Lavalink 노드 상태를 보여줘요. (봇 소유자 전용)' });
			},
			{ guildIds: [...getConfig().discord.devGuildIds], behaviorWhenNotIdentical: RegisterBehavior.Overwrite }
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ ephemeral: true });

		const audio = this.container.audio;
		if (!audio) {
			await interaction.editReply({
				flags: [MessageFlags.IsComponentsV2],
				components: [notice(`${emoji('error')} 오디오 시스템이 초기화되지 않았어요.`)]
			});
			return;
		}

		const lines = [`### ${emoji('spectrum')} Lavalink 노드 상태`, ''];

		const nodes = audio.nodeManager.nodes;
		if (nodes.size === 0) {
			lines.push(`${emoji('error')} 연결된 노드가 없어요.`);
		} else {
			for (const [id, node] of nodes) {
				const statusEmoji = node.connected ? '🟢' : '🔴';
				const stats = node.stats;

				lines.push(`${statusEmoji} **${id}**: \`${node.options.host}:${node.options.port}\``);

				if (stats) {
					const cpuLoad = (stats.cpu?.lavalinkLoad * 100).toFixed(1);
					const memUsed = (stats.memory?.used / 1024 / 1024).toFixed(1);
					const memTotal = (stats.memory?.reservable / 1024 / 1024).toFixed(1);
					const players = stats.players ?? 0;
					const playingPlayers = stats.playingPlayers ?? 0;

					lines.push(`  ${emoji('chart')} 플레이어: ${playingPlayers}/${players} | CPU: ${cpuLoad}%`);
					lines.push(`  ${emoji('disk')} 메모리: ${memUsed}MB / ${memTotal}MB`);
					lines.push(`  ${emoji('clock')} 업타임: ${formatDayHourMinute((stats.uptime ?? 0) / 1000)}`);
				}

				lines.push('');
			}
		}

		await interaction.editReply({
			components: [notice(lines.join('\n'))],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
