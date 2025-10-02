import { version as frameworkVersion, Listener } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import type { StoreRegistryValue } from '@sapphire/pieces';
import { envParseString } from '@skyra/env-utilities';
import { versionInfo, isDev } from '@sirubot/utils';
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

		this.container.client.user?.setActivity(envParseString('BOT_ACTIVITY'));
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
