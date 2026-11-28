import type { Client } from 'discord.js';
import { versionInfo, BOT_NAME, formatTime } from '@sirubot/utils';
import type { Stoppable } from '../lib/lifecycle.ts';

export interface BotActivityDeps {
	activity: string | undefined;
	getClient: () => Client;
	getPlayerCount: () => number;
}

const ACTIVITY_INTERVAL_MS = 60_000;

export class BotActivityService implements Stoppable {
	public readonly name = '봇 상태 메시지';
	private timer: ReturnType<typeof setInterval> | null = null;
	private stopped = false;

	public constructor(private readonly deps: BotActivityDeps) {}

	public start(): void {
		if (this.stopped) return;
		const activitySettings = this.deps.activity;
		if (!activitySettings) return;

		const activityTemplates = activitySettings
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		if (activityTemplates.length === 0) return;

		const updateActivity = () => {
			const client = this.deps.getClient();

			// 종료 진행 중(게이트웨이 파괴 후)에는 갱신하지 않아요
			if (!client.isReady()) return;

			const guilds = client.guilds.cache.size;
			const users = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
			const ping = client.ws.ping;
			const uptime = formatTime(process.uptime());
			const players = this.deps.getPlayerCount();

			const activityTemplate = activityTemplates[Math.floor(Math.random() * activityTemplates.length)];

			const parsedActivity = activityTemplate
				.replace(/%guilds%/g, guilds.toString())
				.replace(/%users%/g, users.toString())
				.replace(/%players%/g, players.toString())
				.replace(/%ping%/g, Math.round(ping).toString())
				.replace(/%uptime%/g, uptime)
				.replace(/%version%/g, versionInfo.getVersion())
				.replace(/%branch%/g, versionInfo.getGitBranch())
				.replace(/%bot_name%/g, BOT_NAME || client.user?.username);

			client.user?.setActivity(parsedActivity);
		};

		updateActivity();
		if (this.timer) clearInterval(this.timer);
		this.timer = setInterval(updateActivity, ACTIVITY_INTERVAL_MS);
		this.timer.unref();
	}

	public async stop(): Promise<void> {
		this.stopped = true;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
}
