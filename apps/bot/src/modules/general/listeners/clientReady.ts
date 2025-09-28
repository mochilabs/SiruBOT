import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import type { StoreRegistryValue } from '@sapphire/pieces';
import { blue, gray, green, magenta, magentaBright, white, yellow } from 'colorette';
import { isDev } from '@sirubot/utils';
import { envParseString } from '@skyra/env-utilities';
import figlet from 'figlet';
import { version as discordJsVersion } from 'discord.js';
import { version as frameworkVersion } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({ once: true })
export class ReadyEvent extends Listener {
	private readonly style = isDev ? yellow : blue;

	public override run() {
		this.printBanner();

		this.container.client.user?.setActivity(envParseString('BOT_ACTIVITY'));
	}

	private async printBanner() {
		const success = green('+');

		const llc = isDev ? magentaBright : white;
		const blc = isDev ? magenta : blue;

		const nodeVersion = process.version;

		// Create ASCII art banner
		const title = figlet.textSync('SiruBOT', { font: 'Standard' });
		const banner = `\n${title}
=========================================
Node.js:            ${nodeVersion}
Discord.js:         ${magentaBright(discordJsVersion)}
Sapphire Framework: ${magentaBright(frameworkVersion)}
=========================================
[${success}] Gateway
${isDev ? `${blc('<')}${llc('/')}${blc('>')} ${llc('DEVELOPMENT MODE 🛠️')}` : ''}
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
