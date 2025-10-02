import { container } from '@sapphire/framework';
import { SapphireInterfaceLogger } from '../../../../core/logger.ts';
import { ILogObj, Logger } from 'tslog';
import { Message, MessageFlags } from 'discord.js';

import * as view from '../../view/controller.ts';
import { CustomPlayer } from './customPlayer.ts';

interface ControllerOptions {
	volume: number;
}

interface ShouldRefreshResult {
	message: Message | null;
	refresh: boolean;
}

export class PlayerNotifier {
	private logger: Logger<ILogObj>;
	private pendingUpdates: Map<string, CustomPlayer> = new Map();
	private isProcessing: Map<string, boolean> = new Map();
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

	private readonly DEBOUNCE_MS = 300;
	private readonly MESSAGE_THRESHOLD = 5;
	private readonly MESSAGE_FETCH_LIMIT = 10;

	constructor() {
		this.logger = (container.logger as SapphireInterfaceLogger).getSubLogger({ name: 'playerNotifier' });
	}

	private get container() {
		return container;
	}

	public onTrackStart(player: CustomPlayer): void {
		this.logger.debug(`Track started in guild: ${player.guildId}`);

		this.debounceEnqueue(player);
	}

	public onPlayerUpdate(player: CustomPlayer): void {
		this.logger.trace(`Player updated in guild: ${player.guildId}`);

		// Ignore track loading
		if (!player.queue.current && player.queue.tracks.length >= 0) return;
		this.debounceEnqueue(player);
	}

	public async onPlayerDestroy(player: CustomPlayer): Promise<void> {
		this.logger.debug(`Player destroyed in guild: ${player.guildId}`);

		// Clear all pending operations
		this.clearDebounceTimer(player.guildId);
		this.pendingUpdates.delete(player.guildId);
		this.isProcessing.delete(player.guildId);

		// Delete controller message
		const messageId = player.getMessageId();
		if (messageId && player.textChannelId) {
			const channel = this.container.client.channels.cache.get(player.textChannelId);
			if (channel?.isSendable()) {
				const message = await channel.messages.fetch(messageId).catch(() => null);
				if (message?.deletable) {
					await message.delete().catch((error) => {
						this.logger.warn(`Failed to delete controller message: ${error.message}`);
					});
				}
			}
		}
	}

	private debounceEnqueue(player: CustomPlayer): void {
		this.clearDebounceTimer(player.guildId);

		const timer = setTimeout(() => {
			this.enqueueUpdate(player);
			this.debounceTimers.delete(player.guildId);
		}, this.DEBOUNCE_MS);

		this.debounceTimers.set(player.guildId, timer);
	}

	private clearDebounceTimer(guildId: string): void {
		const timer = this.debounceTimers.get(guildId);
		if (timer) {
			clearTimeout(timer);
			this.debounceTimers.delete(guildId);
		}
	}

	private enqueueUpdate(player: CustomPlayer): void {
		// Always store the latest player state
		this.pendingUpdates.set(player.guildId, player);

		// If already processing, skip (will be picked up after current update completes)
		if (this.isProcessing.get(player.guildId)) {
			this.logger.trace(`Update already in progress for guild: ${player.guildId}, queuing latest state`);
			return;
		}

		// Start processing
		this.processUpdate(player.guildId);
	}

	private async processUpdate(guildId: string): Promise<void> {
		// Get and clear the pending update
		const player = this.pendingUpdates.get(guildId);
		if (!player) {
			this.isProcessing.set(guildId, false);
			return;
		}

		this.isProcessing.set(guildId, true);
		this.pendingUpdates.delete(guildId);

		try {
			// Execute the update
			await this.updateController(player);
		} finally {
			this.isProcessing.set(guildId, false);

			// If a new update arrived while processing, handle it
			if (this.pendingUpdates.has(guildId)) {
				// Use setImmediate to avoid deep call stacks
				setImmediate(() => this.processUpdate(guildId));
			}
		}
	}

	private async updateController(player: CustomPlayer): Promise<void> {
		try {
			if (!player.textChannelId) {
				this.logger.trace(`No text channel set for guild: ${player.guildId}`);
				return;
			}

			// Check options
			const options = await this.getControllerOptions(player.guildId);
			if (!options) {
				return;
			}

			// Check channel
			const textChannel = this.container.client.channels.cache.get(player.textChannelId);
			if (!textChannel?.isSendable()) {
				return;
			}

			// Check if the message should be refreshed
			const refreshResult = await this.shouldRefreshController(player, textChannel);

			// Create controller view
			const components = view.controllerView({
				player,
				volume: options.volume
			});

			const payload = {
				components: [components],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { roles: [], users: [] }
			} as const;

			// Send or edit message
			if (refreshResult.refresh) {
				const message = await textChannel.send(payload);
				player.setController(message);
				this.logger.debug(`Created new controller message for guild: ${player.guildId}`);
			} else if (refreshResult.message?.editable) {
				await refreshResult.message.edit(payload);
				this.logger.trace(`Updated controller message for guild: ${player.guildId}`);
			}
		} catch (error) {
			this.logger.error(`Failed to update controller for guild ${player.guildId}:`, error);
		}
	}

	private async shouldRefreshController(player: CustomPlayer, channel: Message['channel']): Promise<ShouldRefreshResult> {
		const messageId = player.getMessageId();

		// Create new message if none exists
		if (!messageId) {
			return { message: null, refresh: true };
		}

		try {
			// Fetch the controller message
			const message = await channel.messages.fetch(messageId).catch(() => null);

			if (!message) {
				return { message: null, refresh: true };
			}

			// Check if other messages have accumulated after the controller message
			const recentMessages = await channel.messages.fetch({
				after: message.id,
				limit: this.MESSAGE_FETCH_LIMIT
			});

			const otherMessagesCount = recentMessages.filter((msg) => msg.author.id !== message.author.id).size;

			const shouldRefresh = otherMessagesCount > this.MESSAGE_THRESHOLD;

			if (shouldRefresh) {
				this.logger.debug(`Controller buried by ${otherMessagesCount} messages, refreshing for guild: ${player.guildId}`);
			}

			return { message, refresh: shouldRefresh };
		} catch (error) {
			this.logger.warn(`Failed to check controller refresh status: ${error}`);
			// Create new message on error
			return { message: null, refresh: true };
		}
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
