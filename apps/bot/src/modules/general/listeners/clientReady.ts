import { Events, version as frameworkVersion, Listener } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import type { StoreRegistryValue } from '@sapphire/pieces';
import { envParseString } from '@skyra/env-utilities';
import { versionInfo, isDev, BOT_NAME, formatTime } from '@sirubot/utils';
import { Prisma } from '@sirubot/prisma';

import { version as discordJsVersion } from 'discord.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { blue, gray, green, magenta, magentaBright, white, yellow } from 'colorette';
import figlet from 'figlet';

@ApplyOptions<Listener.Options>({ event: Events.ClientReady })
export class ReadyEvent extends Listener {
	private readonly style = isDev ? yellow : blue;
	/** 상태 갱신 인터벌 — 종료/언로드 때 정리할 수 있게 핸들을 보관한다. */
	private activityTimer: ReturnType<typeof setInterval> | null = null;

	public override async run() {
		// Disable self after first run instead of using `once: true`.
		// `once: true` triggers Piece.unload() which races with the
		// framework's CoreReady listener (same `clientReady` event) and
		// can cause UNLOADED_PIECE when the piece is already removed
		// from the store by the other listener's unload().
		this.enabled = false;

		await this.printBanner().catch((error) => this.container.logger.error('Failed to print banner:', error));

		// 앱 이모지 동기화 — shard 0만 미등록 PNG를 업로드하고, 모든 프로세스가
		// 조회 결과를 `emoji()` 캐시에 주입한다. 실패해도 emoji()가 유니코드 폴백으로
		// 동작해서 기능은 그대로다.
		const shard = this.container.client.shard;
		const shouldUpload = !shard || shard.ids.includes(0);
		await this.container.appEmojiManager?.sync(shouldUpload);

		this.startActivityInterval();
	}

	private startActivityInterval() {
		const activitySettings = envParseString('BOT_ACTIVITY');
		if (!activitySettings) return;

		const activityTemplates = activitySettings
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		if (activityTemplates.length === 0) return;

		const updateActivity = () => {
			const { client, audio } = this.container;

			// 종료 진행 중(게이트웨이 파괴 후)에는 갱신하지 않는다 — 새 연결 없이
			// 파괴된 클라이언트에만 호출이 쌓인다.
			if (!client.isReady()) return;

			const guilds = client.guilds.cache.size;
			const users = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
			const ping = client.ws.ping;
			const uptime = formatTime(process.uptime());
			const players = audio?.players?.size ?? 0;

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
		if (this.activityTimer) clearInterval(this.activityTimer);
		this.activityTimer = setInterval(updateActivity, 60_000); // 1 minute
		// 인터벌이 프로세스 종료를 붙잡지 않도록 한다 (프로세스 수명은 게이트웨이 소켓이 붙잡는다)
		this.activityTimer.unref();
	}

	/** 조각 언로드/리로드 시 상태 갱신 인터벌을 정리한다 — 남기면 프로세스가 종료돼도 루돈다. */
	public override onUnload(): void {
		if (this.activityTimer) {
			clearInterval(this.activityTimer);
			this.activityTimer = null;
		}
	}

	private async printBanner() {
		const packageJSONPath = await readFile(join(process.cwd(), 'package.json'), { encoding: 'utf-8' }).catch(() => null);
		const packageJSON = packageJSONPath ? JSON.parse(packageJSONPath) : null;
		const success = green('+');

		const llc = isDev ? magentaBright : white;
		const blc = isDev ? magenta : blue;

		const versions = {
			Version:
				versionInfo.getVersion() == 'unknown'
					? versionInfo.getGitFullHash()
					: versionInfo.getVersion() + ' (' + versionInfo.getGitHash() + ')',
			Branch: versionInfo.getGitBranch() + (versionInfo.isGitDirty() ? ' (dirty)' : ''),
			'Node.js': process.version,
			Prisma: Prisma.prismaVersion.client,
			'Sapphire Framework': frameworkVersion,
			'Discord.js': discordJsVersion,
			'Lavalink Client': packageJSON?.dependencies?.['lavalink-client'] || 'unknown'
		};

		const maxKeyLen = Math.max(...Object.keys(versions).map((k) => k.length));

		const banner = `\n${figlet.textSync('SiruBOT', { font: 'Standard' })}
=========================================
${Object.entries(versions)
	.map(([key, value]) => `${key.padEnd(maxKeyLen)}    : ${magentaBright(value)}`)
	.join('\n')}
=========================================
[${success}] Gateway Ready
${isDev ? `${blc('<')}${llc('/')}${blc('>')} ${llc('DEVELOPMENT MODE 🛠️')}` : `${blc('<')}${llc('/')}${blc('>')} ${llc('PRODUCTION MODE 🚀')}`}
${this.getStoreDebugInformation()}`;

		this.container.logger.info(banner);
	}

	private getStoreDebugInformation() {
		const { client } = this.container;
		const stores = [...client.stores.values()];
		const last = stores.pop();
		if (!last) return '';

		const storesInfo = [];
		for (const store of stores) storesInfo.push(this.styleStore(store, false));
		storesInfo.push(this.styleStore(last, true));

		return storesInfo.join('\n');
	}

	private styleStore(store: StoreRegistryValue, last: boolean) {
		return gray(`${last ? '└─' : '├─'} Loaded ${this.style(store.size.toString().padEnd(3, ' '))} ${store.name}.`);
	}
}
