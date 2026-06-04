import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { LavalinkHandler } from '../lavalink/handlers/lavalinkHandler.ts';

@ApplyOptions<Listener.Options>({ once: true })
export class ReadyEvent extends Listener {
	public override async run() {
		await this.initAudio().catch((error) => this.container.logger.fatal('Failed to initialize Lavalink client', error));
	}

	private async initAudio() {
		try {
			this.container.logger.info('Initializing Lavalink client...');
			this.container.lavalinkHandler = new LavalinkHandler(this.container.audio);
			await this.container.audio.init({
				id: this.container!.client!.user!.id
			});
		} catch (error) {
			this.container.logger.fatal('Failed to initialize lavalink client', error);
		}
	}
}
