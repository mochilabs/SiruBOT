import { Events, version as frameworkVersion, Listener } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import type { StoreRegistryValue } from '@sapphire/pieces';
import { envParseString } from '@skyra/env-utilities';
import { versionInfo, isDev, BOT_NAME, formatTime } from '@sirubot/utils';
import { Prisma } from '@sirubot/prisma';

import { version as discordJsVersion } from 'discord.js';
import { startMemoryTidySchedule } from '../../../services/aiChatService.ts';
import { startOhaasaPrefetchSchedule } from '../../../services/ohaasaTranslate.ts';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { blue, gray, green, magenta, magentaBright, white, yellow } from 'colorette';
import figlet from 'figlet';

@ApplyOptions<Listener.Options>({ event: Events.ClientReady })
export class ReadyEvent extends Listener {
	private readonly style = isDev ? yellow : blue;

	public override async run() {
		// Disable self after first run instead of using `once: true`.
		// `once: true` triggers Piece.unload() which races with the
		// framework's CoreReady listener (same `clientReady` event) and
		// can cause UNLOADED_PIECE when the piece is already removed
		// from the store by the other listener's unload().
		this.enabled = false;

		await this.printBanner().catch((error) => this.container.logger.error('Failed to print banner:', error));

		// 야간 배치들 — BOT_ACTIVITY 파싱이 던져도 항상 시작되도록 활동 설정보다 먼저
		// (프로세스 중복 실행 방지를 위해 셰드 0만)
		const shard = this.container.client.shard;
		if (!shard || shard.ids.includes(0)) {
			// 메모리 정리(nightly pass)·오하아사 프리패치 — data-api 게이트웨이가 담당해요.
			// 게이트웨이가 없으면(개발 등) 봇이 직접 스케줄을 돌려요.
			if (!process.env.DATA_API_URL?.trim()) {
				startMemoryTidySchedule();
				startOhaasaPrefetchSchedule();
			}
		}

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
		setInterval(updateActivity, 60_000); // 1 minute
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
