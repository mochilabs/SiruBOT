import { getLogger } from './logger.ts';

const logger = getLogger('discordNotifier');

interface EmbedField {
	name: string;
	value: string;
	inline?: boolean;
}

interface NotifyOptions {
	title: string;
	description?: string;
	color: number;
	fields?: EmbedField[];
}

const Colors = {
	GREEN: 0x57f287,
	RED: 0xed4245,
	BLUE: 0x5865f2,
	YELLOW: 0xfee75c
} as const;

export class DiscordNotifier {
	private webhookUrl: string | null;

	constructor(webhookUrl?: string) {
		this.webhookUrl = webhookUrl ?? null;

		if (this.webhookUrl) {
			logger.info('Discord webhook notifications enabled');
		} else {
			logger.info('Discord webhook URL not set, notifications disabled');
		}
	}

	private async send(options: NotifyOptions): Promise<void> {
		if (!this.webhookUrl) return;

		try {
			const body = {
				embeds: [
					{
						title: options.title,
						description: options.description,
						color: options.color,
						fields: options.fields,
						timestamp: new Date().toISOString(),
						footer: { text: 'SiruBOT Shard Manager' }
					}
				]
			};

			const response = await fetch(this.webhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				logger.warn(`Webhook request failed: ${response.status} ${response.statusText}`);
			}
		} catch (error) {
			logger.warn('Failed to send webhook notification:', error);
		}
	}

	// ── Events ──────────────────────────────────────────

	async managerStarted(shardCount: number, shardsPerProcess: number): Promise<void> {
		await this.send({
			title: '🟢 Shard Manager 시작',
			description: 'Shard Manager가 시작되었습니다.',
			color: Colors.GREEN,
			fields: [
				{ name: '샤드 수', value: `${shardCount}`, inline: true },
				{ name: '프로세스당 샤드', value: `${shardsPerProcess}`, inline: true }
			]
		});
	}

	async managerStopped(): Promise<void> {
		await this.send({
			title: '🔴 Shard Manager 종료',
			description: 'Shard Manager가 종료되었습니다.',
			color: Colors.RED
		});
	}

	private formatProcess(wsId: string, hostname?: string): string {
		return hostname ? `${wsId} (${hostname})` : wsId;
	}

	async shardConnected(wsId: string, shardIds: number[], hostname?: string): Promise<void> {
		await this.send({
			title: '📡 샤드 프로세스 연결',
			color: Colors.BLUE,
			fields: [
				{
					name: '프로세스',
					value: this.formatProcess(wsId, hostname),
					inline: true
				},
				{ name: '샤드', value: `[${shardIds.join(', ')}]`, inline: true }
			]
		});
	}

	async shardReady(wsId: string, shardIds: number[], hostname?: string): Promise<void> {
		await this.send({
			title: '✅ 샤드 준비 완료',
			color: Colors.GREEN,
			fields: [
				{
					name: '프로세스',
					value: this.formatProcess(wsId, hostname),
					inline: true
				},
				{ name: '샤드', value: `[${shardIds.join(', ')}]`, inline: true }
			]
		});
	}

	async shardDisconnected(wsId: string, shardIds: number[], hostname?: string): Promise<void> {
		await this.send({
			title: '⚠️ 샤드 연결 해제',
			color: Colors.YELLOW,
			fields: [
				{
					name: '프로세스',
					value: this.formatProcess(wsId, hostname),
					inline: true
				},
				{ name: '샤드', value: `[${shardIds.join(', ')}]`, inline: true }
			]
		});
	}

	async shardHeartbeatTimeout(wsId: string, shardIds: number[], hostname?: string): Promise<void> {
		await this.send({
			title: '💀 하트비트 타임아웃',
			description: '샤드 프로세스가 응답하지 않아 연결을 해제합니다.',
			color: Colors.RED,
			fields: [
				{
					name: '프로세스',
					value: this.formatProcess(wsId, hostname),
					inline: true
				},
				{ name: '샤드', value: `[${shardIds.join(', ')}]`, inline: true }
			]
		});
	}
}
