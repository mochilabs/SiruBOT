import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { MessageFlags, VoiceState } from 'discord.js';
import { notice } from '../../general/view/notice.ts';
import { container } from '@sapphire/pieces';
import { SapphireInterfaceLogger } from '../../../core/logger.ts';
import { Logger, ILogObj } from 'tslog';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { emoji } from '@sirubot/utils';
import { getConfig } from '../../../lib/config.ts';

@ApplyOptions<Listener.Options>({
	event: Events.VoiceStateUpdate
})
export class VoiceStateUpdateListener extends Listener {
	private leaveTimers = new Map<string, NodeJS.Timeout>();
	/** 음성 채널이 비었을 때 퇴장 유예(ms) — 기본 5분, lib/config.ts */
	private get LEAVE_TIMEOUT_MS(): number {
		return getConfig().playback.leaveTimeoutMs;
	}
	private logger: Logger<ILogObj>;

	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, options);
		this.logger = (container.logger as SapphireInterfaceLogger).getSubLogger({ name: 'VoiceStateUpdateListener' });
	}

	public override async run(oldState: VoiceState, newState: VoiceState) {
		const guildId = oldState.guild.id;
		const player = this.container.audio.getPlayer(guildId);

		if (!player) return;

		if (newState.member?.id === this.container.client.user?.id) {
			if (!newState.channelId) {
				this.clearTimer(guildId);
				return;
			}

			if (!newState.channel) return;
			this.checkEmptyChannel(newState.channel, guildId, player);
			return;
		}

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
			this.logger.debug(`Channel ${channel.id} is empty (or everyone deafened). Starting 5 minute leave timer for guild ${guildId}.`);

			this.clearTimer(guildId);

			const timer = setTimeout(async () => {
				try {
					this.logger.info(`Leaving empty voice channel in guild ${guildId} after 5 minutes.`);
					if (player.textChannelId) {
						const textChannel = this.container.client.channels.cache.get(player.textChannelId);
						if (textChannel?.isSendable()) {
							await textChannel.send({
								components: [notice(`${emoji('sleep')} 장시간 아무도 음악을 듣지 않아서 음성 채널에서 퇴장했어요.`)],
								flags: [MessageFlags.IsComponentsV2]
							});
						}
					}
					// Do not display additional message
					player.transitionState.stopByCommand = true;
					await player.destroy();
				} catch (error) {
					this.logger.error(`Failed to leave empty voice channel in guild ${guildId}:`, error);
				} finally {
					this.leaveTimers.delete(guildId);
				}
			}, this.LEAVE_TIMEOUT_MS);

			this.leaveTimers.set(guildId, timer);
		} else {
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
