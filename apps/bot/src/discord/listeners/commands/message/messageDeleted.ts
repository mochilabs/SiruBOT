import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message } from 'discord.js';
import { notice } from '../../../../lib/notice.ts';
import { emoji, MemoryCache } from '@sirubot/utils';
import { sleep } from '@sirubot/utils/time';
import { inGuildTheme } from '../../../../lib/guildThemeScope.ts';
import * as guildChannels from '../../../../services/guildSettings/channels.ts';

const deleteCountCache = new MemoryCache<string, number>({
	maxSize: 100,
	ttl: 60 * 60 * 1000
});

@ApplyOptions<Listener.Options>({
	event: Events.MessageDelete
})
export class MessageDeleteListener extends Listener {
	public override async run(message: Message) {
		if (!this.container.audio) return;
		if (!message.guild?.id) return;

		const guildId = message.guild.id;

		const panelMessageId = await guildChannels.getTextMessage(this.container.guildService, guildId).catch(() => null);
		if (panelMessageId && panelMessageId === message.id) {
			await guildChannels.setTextMessage(this.container.guildService, guildId, null).catch(() => null);
			if (!this.container.audio.getPlayer(guildId)?.queue.current) {
				await this.container.lavalink.playerNotifier.syncPanel(guildId, null);
			}
		}

		const player = this.container.audio.getPlayer(guildId);
		if (player) {
			// 봇이 지울 때는 deleteController가 먼저 messageId를 비우므로 여기선 외부 삭제만 해당해요.
			if (message.id === player.messageId) {
				player.messageId = null;
				player.controller = null;

				const currentCount = Number(deleteCountCache.get(guildId)) || 0;
				const newCount = currentCount + 1;
				deleteCountCache.set(guildId, newCount);

				if (newCount === 3) {
					if (message.channel.isSendable()) {
						try {
							const tooltip = await message.channel.send({
								components: [
									await inGuildTheme(guildId, () =>
										notice(
											`-# ${emoji('bulb')} 봇의 노래 재생 메시지가 불편하시다면, /설정 명령어로 **[오디오 컨트롤러]** 옵션을 끌 수 있어요.`
										)
									)
								]
							});

							await sleep(10000);
							await tooltip.delete();
						} catch (_) {}
					}
				}
			}
		}
	}
}
