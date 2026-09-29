import { container } from '@sapphire/framework';
import { SapphireInterfaceLogger } from '../../../../core/logger.ts';
import { ILogObj, Logger } from 'tslog';
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';

import * as view from '../../view/controller.ts';
import { CustomPlayer } from './customPlayer.ts';
import { Guild } from '@sirubot/prisma';

type ControllerOptions = Pick<Guild, 'enableController' | 'volume'>;

export class PlayerNotifier {
	private logger: Logger<ILogObj>;
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

	private readonly DEBOUNCE_MS = Number(process.env.NOTIFIER_DEBOUNCE_MS) || 300;

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

		try {
			// when interaction is noen and player has not textChannelId, throw error
			if (!interaction && !player.textChannelId) throw new Error(`Player has not textChannelId ${player.guildId}`);
			const options = await this.getControllerOptions(player.guildId);

			// Check if options null and guild not using audio controller, and this method called automatically, ignore it
			if (!options || (!options.enableController && !interaction)) return;

			// 2. Delete existing controller message (only when a new one will actually be sent)
			await this.deleteController(player);

			// 3. Build and send new controller message
			const components = view.controllerView({
				player,
				volume: options.volume
			});

			let message;
			if (interaction) {
				message = await interaction.reply({
					components: [components],
					flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
					allowedMentions: { roles: [], users: [] },
					fetchReply: true
				});
				player.textChannelId = interaction.channelId;
			} else {
				if (!player.textChannelId) return;
				const textChannel = this.container.client.channels.cache.get(player.textChannelId);
				if (!textChannel?.isSendable()) return;
				message = await textChannel.send({
					components: [components],
					flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
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
				if (!options || !options.enableController) return;

				const components = view.controllerView({
					player,
					volume: options.volume
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
			} catch (error: any) {
				if (error.code === 10008) {
					this.logger.debug(`Unknown message error ignored while updating controller for guild ${player.guildId}`);
					// 고정 채널: 메시지가 지워졌으면 refs를 비우고 새 컨트롤러를 1회 다시 보내 이후부터 edit을 재개한다.
					if (player.textChannelId && (await this.isPinnedChannel(player.guildId, player.textChannelId))) {
						player.messageId = null;
						player.controller = null;
						await this.sendController(player);
					}
				} else {
					this.logger.error(`Failed to update controller for guild ${player.guildId}:`, error);
				}
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

		const controllerMessage = player.controller;
		const messageId = player.messageId;

		// 봇이 직접 삭제할 때, messageDeleted 이벤트가 발생했을 때 구별하기 위해 미리 null로 비워둡니다.
		player.messageId = null;
		player.controller = null;

		// controller 객체가 이미 있으면 fetch 없이 바로 삭제
		if (controllerMessage?.deletable) {
			await controllerMessage.delete().catch((error: any) => {
				if (error.code !== 10008) {
					this.logger.warn(`Failed to delete controller message for guild ${player.guildId}: ${error.message}`);
				}
			});
			return;
		}

		// controller 객체가 없지만 messageId가 남아있는 경우 (resume 등) fallback fetch
		if (messageId && player.textChannelId) {
			const channel = this.container.client.channels.cache.get(player.textChannelId);
			if (channel?.isSendable()) {
				const message = await channel.messages.fetch(messageId).catch(() => null);
				if (message?.deletable) {
					await message.delete().catch((error: any) => {
						if (error.code !== 10008) {
							this.logger.warn(`Failed to delete controller message for guild ${player.guildId}: ${error.message}`);
						}
					});
				}
			}
		}
	}

	// Event handlers
	public async onTrackStart(player: CustomPlayer): Promise<void> {
		this.logger.debug(`Track started in guild: ${player.guildId}`);

		if (player.textChannelId && player.messageId) {
			// 고정 채널 모드: 채팅에 밀려도 항상 같은 메시지를 edit로 유지한다.
			if (await this.isPinnedChannel(player.guildId, player.textChannelId)) {
				this.updateController(player);
				return;
			}
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

		// Ignore when nothing is playing (e.g. track loading / idle)
		if (!player.queue.current) {
			// 재생 중인데 current가 비어 있으면 전이 리커널(trackHandler)이 복원할 때까지 기다린다.
			if (player.playing) {
				this.logger.debug(`onPlayerUpdate skipped: current is null while playing (guild ${player.guildId}), transition reconcile pending`);
			}
			return;
		}
		this.updateController(player);
	}

	public async onPlayerDestroy(player: CustomPlayer): Promise<void> {
		this.logger.debug(`Player destroyed in guild: ${player.guildId}`);
		await this.deleteController(player);
	}

	private async getControllerOptions(guildId: string): Promise<ControllerOptions | null> {
		try {
			const data = await this.container.guildService.getGuild(guildId);

			return data;
		} catch (error) {
			this.logger.error(`Failed to get controller options for guild ${guildId}:`, error);
			return null;
		}
	}

	/** 컨트롤러가 떠 있는 채널이 길드의 고정 채널인지 — 맞으면 핀 모드(edit 유지)로 다룬다. */
	private async isPinnedChannel(guildId: string, textChannelId: string): Promise<boolean> {
		try {
			const pinned = await this.container.guildService.getPinnedChannel(guildId);
			return Boolean(pinned) && pinned === textChannelId;
		} catch {
			return false;
		}
	}
}
