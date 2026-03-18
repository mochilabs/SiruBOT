import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { ContainerBuilder, MessageFlags, VoiceState } from 'discord.js';
import { container } from '@sapphire/pieces';
import { SapphireInterfaceLogger } from '../../../core/logger.ts';
import { Logger, ILogObj } from 'tslog';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { DEFAULT_COLOR } from '@sirubot/utils';

@ApplyOptions<Listener.Options>({
	event: Events.VoiceStateUpdate
})
export class VoiceStateUpdateListener extends Listener {
	private leaveTimers = new Map<string, NodeJS.Timeout>();
	private readonly LEAVE_TIMEOUT_MS = 300000; // 5 minutes
	private logger: Logger<ILogObj>;

	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, options);
		this.logger = (container.logger as SapphireInterfaceLogger).getSubLogger({ name: 'VoiceStateUpdateListener' });
	}

	public override async run(oldState: VoiceState, newState: VoiceState) {
		const guildId = oldState.guild.id;
		const player = this.container.audio.getPlayer(guildId);

		if (!player) return;

		// Bot moved or disconnected
		if (newState.member?.id === this.container.client.user?.id) {
			if (!newState.channelId) {
				// Bot disconnected, clear timer
				this.clearTimer(guildId);
				return;
			}

			// Re-evaluate the new channel
			this.checkEmptyChannel(newState.channel!, guildId, player);
			return;
		}

		// User joined or left the bot's channel
		if (oldState.channelId === player.voiceChannelId || newState.channelId === player.voiceChannelId) {
			const channel = oldState.channelId === player.voiceChannelId ? oldState.channel : newState.channel;
			if (channel) {
				this.checkEmptyChannel(channel, guildId, player);
			}
		}
	}

	private checkEmptyChannel(channel: VoiceState['channel'], guildId: string, player: CustomPlayer) {
		if (!channel) return;

		// Non-bot members that are actually listening (not deafened)
		const listeningMembers = channel.members.filter((m) => !m.user.bot && !m.voice.deaf);

		if (listeningMembers.size === 0) {
			// Channel is empty or everyone is deafened, start timer
			this.logger.debug(`Channel ${channel.id} is empty (or everyone deafened). Starting 5 minute leave timer for guild ${guildId}.`);

			// Clear existing timer if there is one
			this.clearTimer(guildId);

			const timer = setTimeout(async () => {
				this.logger.info(`Leaving empty voice channel in guild ${guildId} after 5 minutes.`);
				if (player.textChannelId) {
					const textChannel = this.container.client.channels.cache.get(player.textChannelId);
					if (textChannel?.isSendable()) {
						await textChannel.send({
							components: [
								new ContainerBuilder()
									.setAccentColor(DEFAULT_COLOR)
									.addTextDisplayComponents((textDisplay) =>
										textDisplay.setContent('💤 장시간 아무도 음악을 듣지 않아서 음성 채널에서 퇴장했어요.')
									)
							],
							flags: [MessageFlags.IsComponentsV2]
						});
					}
				}
				// Do not display additional message
				player.set('stopByCommand', true);
				await player.destroy();

				this.leaveTimers.delete(guildId);
			}, this.LEAVE_TIMEOUT_MS);

			this.leaveTimers.set(guildId, timer);
		} else {
			// Channel is not empty, clear timer
			if (this.leaveTimers.has(guildId)) {
				this.logger.debug(`User joined channel ${channel.id}. Cancelling leave timer for guild ${guildId}.`);
				this.clearTimer(guildId);
			}
		}
	}

	private clearTimer(guildId: string) {
		const timer = this.leaveTimers.get(guildId);
		if (timer) {
			clearTimeout(timer);
			this.leaveTimers.delete(guildId);
		}
	}
}
