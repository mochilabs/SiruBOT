import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { VoiceState } from 'discord.js';

@ApplyOptions<Listener.Options>({
	event: Events.VoiceStateUpdate
})
export class TempVoiceStateListener extends Listener {
	public override async run(oldState: VoiceState, newState: VoiceState): Promise<void> {
		try {
			await this.container.tempVoiceService.handleVoiceState(oldState, newState);
		} catch (error) {
			this.container.logger.error(`[tempVoice] listener error (guild ${newState.guild.id}): ${error}`);
		}
	}
}
