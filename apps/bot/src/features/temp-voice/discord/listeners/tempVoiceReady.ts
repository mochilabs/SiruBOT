import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';

@ApplyOptions<Listener.Options>({ event: Events.ClientReady })
export class TempVoiceReadyListener extends Listener {
	public override async run(): Promise<void> {
		await this.container.tempVoiceService.restoreWithRetry();
	}
}
