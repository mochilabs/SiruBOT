import { container } from '@sapphire/framework';
import { SapphireInterfaceLogger } from '../../../../core/logger.ts';
import { ILogObj, Logger } from 'tslog';
import { Message, MessageFlags, TextBasedChannel } from 'discord.js';

import * as view from '../../view/controller.ts';
import { Player } from 'lavalink-client';

export class PlayerNotifier {
	private logger: Logger<ILogObj>;
	private messageMap: Map<string, Message> = new Map();

	constructor() {
		this.logger = (container.logger as SapphireInterfaceLogger).getSubLogger({ name: 'playerNotifier' });
	}

	private get container() {
		return container;
	}

	public async onTrackStart(player: Player) {
		this.logger.debug(`onTrackStart: ${player.guildId}`);
		if (!player.textChannelId) return;

		const textChannel = this.container.client.channels.cache.get(player.textChannelId);
		if (!textChannel?.isSendable()) return;
		
		const cachedMessage = this.messageMap.get(player.guildId);
		if (cachedMessage && cachedMessage.editable) return;

		const { enableController, volume, related } = await this.container.guildService.getGuild(player.guildId);
		if (!enableController) return;

		const components = view.controllerView({ player, volume, related });
		const message = await textChannel?.send({
			components: [components],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: {
				roles: [],
				users: []
			}
		});

		this.messageMap.set(player.guildId, message);
	}

	public async onPlayerUpdate(player: Player) {
		this.logger.debug(`onPlayerUpdate: ${player.guildId}`);
		if (!player.textChannelId) return;

		const textChannel = this.container.client.channels.cache.get(player.textChannelId);
		if (!textChannel?.isSendable()) return;
		const { enableController, volume, related } = await this.container.guildService.getGuild(player.guildId);
		if (!enableController) return;

		const components = view.controllerView({ player, volume, related });
		const prevMessage = this.messageMap.get(player.guildId);
		if (prevMessage && prevMessage.editable) {
			await prevMessage.edit({
				components: [components],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: {
					roles: [],
					users: []
				}
			});
		}
		// 메세지 삭제되거나 너무 위로 올라가면 지우고 다시 생성
	}
}
