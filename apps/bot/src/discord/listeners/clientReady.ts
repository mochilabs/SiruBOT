import { Events, version as frameworkVersion, Listener } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import type { StoreRegistryValue } from '@sapphire/pieces';
import { versionInfo, isDev } from '@sirubot/utils';
import { Prisma } from '@sirubot/prisma';

import { version as discordJsVersion } from 'discord.js';
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

		// 앱 이모지 동기화 — shard 0만 미등록 PNG를 업로드하고, 모든 프로세스가
		// 조회 결과를 `emoji()` 캐시에 주입한다. 실패해도 emoji()가 유니코드 폴백으로
		// 동작해서 기능은 그대로다.
		const shard = this.container.client.shard;
		const shouldUpload = !shard || shard.ids.includes(0);
		await this.container.appEmojiManager?.sync(shouldUpload);

		// 상태 메시지 순환은 container.botActivity가 소유해요 — 종료 때 stop()이 인터벌을 해제해요
		this.container.botActivity.start();
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
