import type { Client } from 'discord.js';
import { versionInfo, BOT_NAME, formatTime } from '@sirubot/utils';
import type { Stoppable } from '../lib/lifecycle.ts';

/** 봇 상태 메시지 서비스가 쓰는 의존성 — client·플레이어 수는 부팅 뒤에 채워져서 호출 시점에 읽어요 */
export interface BotActivityDeps {
	/** BOT_ACTIVITY 설정값 — 쉼표로 구분한 템플릿 목록이에요 (없으면 순환하지 않아요) */
	activity: string | undefined;
	getClient: () => Client;
	getPlayerCount: () => number;
}

/** 상태 메시지 갱신 주기 */
const ACTIVITY_INTERVAL_MS = 60_000;

/**
 * 봇 상태 메시지(활동) 순환 인터벌의 소유자예요 (container.botActivity). 템플릿은 BOT_ACTIVITY 설정에서 읽어요.
 * stop()이 인터벌을 해제하고 이후 start는 무시해서, 종료 절차 중에 갱신이 발화하지 않아요.
 */
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

			// 종료 진행 중(게이트웨이 파괴 후)에는 갱신하지 않는다 — 새 연결 없이
			// 파괴된 클라이언트에만 호출이 쌓인다.
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
		// 중복 호출 시 이전 인터벌이 고아가 되지 않게 정리한다
		if (this.timer) clearInterval(this.timer);
		this.timer = setInterval(updateActivity, ACTIVITY_INTERVAL_MS);
		// 인터벌이 프로세스 종료를 붙잡지 않도록 한다 (프로세스 수명은 게이트웨이 소켓이 붙잡는다)
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
