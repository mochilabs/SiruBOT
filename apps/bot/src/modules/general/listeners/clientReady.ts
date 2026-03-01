import { version as frameworkVersion, Listener } from '@sapphire/framework';
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

@ApplyOptions<Listener.Options>({ once: true })
export class ReadyEvent extends Listener {
	private readonly style = isDev ? yellow : blue;

	public override run() {
		this.printBanner();

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
				.replace(/%ping%/g, ping.toString())
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
		const last = stores.pop()!;

		const storesInfo = [];
		for (const store of stores) storesInfo.push(this.styleStore(store, false));
		storesInfo.push(this.styleStore(last, true));

		return storesInfo.join('\n');
	}

	private styleStore(store: StoreRegistryValue, last: boolean) {
		return gray(`${last ? '└─' : '├─'} Loaded ${this.style(store.size.toString().padEnd(3, ' '))} ${store.name}.`);
	}
}
