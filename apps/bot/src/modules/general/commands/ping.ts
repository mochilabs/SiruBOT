import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, SeparatorBuilder, SeparatorSpacingSize } from 'discord.js';

/** ms → 표기 (정수, 하단 콤마 제거) */
function ms(value: number): string {
	return `${Math.round(value)}ms`;
}

/** 지연 수준 이모지 — 100ms 단계 */
function latencyEmoji(value: number): string {
	if (value < 0) return '⚪';
	if (value < 50) return '🟢';
	if (value < 150) return '🟡';
	return '🔴';
}

/** 한 줄 지표 — `항목      값` 정렬 */
function metricLine(emoji: string, label: string, value: string): string {
	return `${emoji} **${label}** — \`${value}\``;
}

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'ping',
	description: '봇과 각 구간의 연결 상태를 보여드려요.',
	fullCategory: ['일반']
})
export class PingCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setDescription(this.description)
				.setNameLocalizations({ ko: '핑' })
				.setDescriptionLocalizations({ ko: '봇과 각 구간의 연결 상태를 보여드려요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const deferStart = Date.now();
		await interaction.deferReply();
		// 유저 명령어 → 봇 응답까지 왕복 (interaction.createdTimestamp 기준)
		const apiRoundTrip = Date.now() - interaction.createdTimestamp;
		const deferOverhead = Date.now() - deferStart;

		const client = this.container.client;
		const lines: string[] = ['### 📡 핑 (Ping)', ''];

		// ── 명령어 API ──
		lines.push(metricLine('⚡', '명령어 처리', ms(apiRoundTrip + deferOverhead)));
		lines.push('');

		// ── 게이트웨이 (Discord WS) ──
		const shards = [...client.ws.shards.values()];
		if (shards.length > 0) {
			const pings = shards.map((shard) => shard.ping).filter((ping) => ping >= 0);
			const avgPing = pings.length > 0 ? pings.reduce((a, b) => a + b, 0) / pings.length : -1;
			lines.push(metricLine(latencyEmoji(avgPing), '게이트웨이', pings.length > 0 ? ms(avgPing) : '측정 중...'));
			// 다중 샤드면 샤드별 핑도
			if (shards.length > 1) {
				lines.push(`-# 샤드별: ${shards.map((shard) => `#${shard.id} ${shard.ping >= 0 ? ms(shard.ping) : 'N/A'}`).join(' · ')}`);
			}
		} else {
			lines.push(metricLine('⚪', '게이트웨이', '샤드 없음'));
		}
		lines.push('');

		// ── 샤드 매니저 ──
		const shardClient = this.container.shardClient;
		if (shardClient?.getIdentity()) {
			// heartbeat ACK 기반 RTT는 별도 노출이 없어 상태만 표시
			const shardIds = shardClient.getIdentity()!.shardIds;
			lines.push(metricLine('🟢', '샤드 매니저', `연결됨 (샤드 ${shardIds.join(', ')})`));
		} else {
			lines.push(metricLine('⚪', '샤드 매니저', '미연결 (개발 모드)'));
		}
		lines.push('');

		// ── Lavalink 노드 ──
		const audio = this.container.audio;
		if (audio) {
			const nodes = [...audio.nodeManager.nodes.values()];
			if (nodes.length > 0) {
				for (const node of nodes) {
					const connectionPing = node.heartBeatPing;
					const emoji = !node.connected ? '🔴' : latencyEmoji(connectionPing);
					const value = !node.connected ? '연결 끊김' : connectionPing >= 0 ? ms(connectionPing) : '측정 중...';
					lines.push(metricLine(emoji, `Lavalink (${node.id})`, value));
				}
			} else {
				lines.push(metricLine('🔴', 'Lavalink', '노드 없음'));
			}
		} else {
			lines.push(metricLine('🔴', 'Lavalink', '초기화 안 됨'));
		}
		lines.push('');

		// ── Redis ──
		const redis = this.container.redisStore;
		lines.push(metricLine(redis.ready ? '🟢' : '🔴', 'Redis', redis.ready ? '정상' : '미연결'));

		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents((t) => t.setContent(lines.join('\n')));
		containerComponent.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
		containerComponent.addTextDisplayComponents((t) => t.setContent(`-# 처리 시작 ~ 응답 전송까지 \`${deferOverhead}ms\``));

		await interaction.editReply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
