import { container } from '@sapphire/framework';
import { SapphireInterfaceLogger } from '../../../../core/logger.ts';
import { ILogObj, Logger } from 'tslog';
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';

import * as view from '../../view/controller.ts';
import { CustomPlayer } from './customPlayer.ts';

interface ControllerOptions {
	volume: number;
}

export class PlayerNotifier {
	private logger: Logger<ILogObj>;
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

	private readonly DEBOUNCE_MS = 300;

	constructor() {
		this.logger = (container.logger as SapphireInterfaceLogger).getSubLogger({ name: 'playerNotifier' });
	}

	private get container() {
		return container;
	}

	// Force send controller message
	public async sendController(player: CustomPlayer, interaction?: ChatInputCommandInteraction): Promise<void> {
		this.logger.debug(`Sending new controller for guild: ${player.guildId}`);

		// 1. Clear ongoing debounce timer
		this.clearDebounceTimer(player.guildId);

		// 2. Delete existing controller message
		await this.deleteController(player);

		// 3. Build and send new controller message
		try {
			if (!interaction && !player.textChannelId) return;
			const options = await this.getControllerOptions(player.guildId);
			if (!options) return;

			const components = view.controllerView({
				player,
				volume: options.volume,
				page: player.queuePage
			});

			let message;
			if (interaction) {
				message = await interaction.reply({
					components: [components],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { roles: [], users: [] },
					fetchReply: true
				});
				player.textChannelId = interaction.channelId;
			} else {
				const textChannel = this.container.client.channels.cache.get(player.textChannelId!);
				if (!textChannel?.isSendable()) return;
				message = await textChannel.send({
					components: [components],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { roles: [], users: [] }
				});
			}

			player.messageId = message.id;
			player.controller = message;
			this.logger.debug(`Created new controller message for guild: ${player.guildId}`);
		} catch (error) {
			this.logger.error(`Failed to send new controller for guild ${player.guildId}:`, error);
		}
	}

	// Update controller message (debounce)
	public updateController(player: CustomPlayer): void {
		this.clearDebounceTimer(player.guildId);

		const timer = setTimeout(async () => {
			this.debounceTimers.delete(player.guildId);
			try {
				if (!player.messageId || !player.controller) return;

				const options = await this.getControllerOptions(player.guildId);
				if (!options) return;

				const components = view.controllerView({
					player,
					volume: options.volume,
					page: player.queuePage
				});

				const payload = {
					components: [components],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { roles: [], users: [] }
				} as const;

				if (player.controller.editable) {
					await player.controller.edit(payload);
					this.logger.trace(`Updated controller message for guild: ${player.guildId}`);
				}
			} catch (error) {
				this.logger.error(`Failed to update controller for guild ${player.guildId}:`, error);
			}
		}, this.DEBOUNCE_MS);

		this.debounceTimers.set(player.guildId, timer);
	}

	// Clear debounce timer
	private clearDebounceTimer(guildId: string): void {
		const timer = this.debounceTimers.get(guildId);
		if (timer) {
			clearTimeout(timer);
			this.debounceTimers.delete(guildId);
		}
	}

	// Delete controller message
	public async deleteController(player: CustomPlayer): Promise<void> {
		this.clearDebounceTimer(player.guildId);

		const messageId = player.messageId;
		if (messageId && player.textChannelId) {
			const channel = this.container.client.channels.cache.get(player.textChannelId);
			if (channel?.isSendable()) {
				const message = await channel.messages.fetch(messageId).catch(() => null);
				if (message?.deletable) {
					await message.delete().catch((error) => {
						this.logger.warn(`Failed to delete controller message for guild ${player.guildId}: ${error.message}`);
					});
				}
			}
		}

		player.messageId = null;
		player.controller = null;
	}

	// Event handlers
	public async onTrackStart(player: CustomPlayer): Promise<void> {
		this.logger.debug(`Track started in guild: ${player.guildId}`);
		
		if (player.textChannelId && player.messageId) {
			const channel = this.container.client.channels.cache.get(player.textChannelId);
			if (channel?.isSendable()) {
				// 만약 컨트롤러가 이미 마지막 메시지라면 굳이 다시 보낼 필요 없이 업데이트만 진행
				if (channel.lastMessageId === player.messageId) {
					this.updateController(player);
					return;
				}
			}
		}

		await this.sendController(player);
	}

	public onPlayerUpdate(player: CustomPlayer): void {
		this.logger.trace(`Player updated in guild: ${player.guildId}`);

		// Ignore track loading
		if (!player.queue.current && player.queue.tracks.length >= 0) return;
		this.updateController(player);
	}

	public async onPlayerDestroy(player: CustomPlayer): Promise<void> {
		this.logger.debug(`Player destroyed in guild: ${player.guildId}`);
		await this.deleteController(player);
	}

	private async getControllerOptions(guildId: string): Promise<ControllerOptions | null> {
		try {
			const { enableController, volume } = await this.container.guildService.getGuild(guildId);

			if (!enableController) {
				this.logger.trace(`Controller disabled for guild: ${guildId}`);
				return null;
			}

			return { volume };
		} catch (error) {
			this.logger.error(`Failed to get controller options for guild ${guildId}:`, error);
			return null;
		}
	}
}
