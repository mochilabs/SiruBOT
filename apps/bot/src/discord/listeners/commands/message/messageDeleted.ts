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

		// 대기 화면 상태의 기본 채널 패널을 사용자가 지웠다면 다시 올린다 (재생 중이면 컨트롤러 갱신이 새로 보낸다).
		const panelMessageId = await guildChannels.getTextMessage(this.container.guildService, guildId).catch(() => null);
		if (panelMessageId && panelMessageId === message.id) {
			await guildChannels.setTextMessage(this.container.guildService, guildId, null).catch(() => null);
			if (!this.container.audio.getPlayer(guildId)?.queue.current) {
				await this.container.lavalink.playerNotifier.syncPanel(guildId, null);
			}
		}

		const player = this.container.audio.getPlayer(guildId);
		if (player) {
			// playerNotifier.deleteController 에서 봇이 지우기 전엔 null로 바꾸기 때문에
			// 여기 들어온다는 것은 '사용자' 또는 '다른 봇'이 강제로 지웠다는 뜻입니다.
			if (message.id === player.messageId) {
				// 더 이상 참조하지 않도록 초기화
				player.messageId = null;
				player.controller = null;

				const currentCount = Number(deleteCountCache.get(guildId)) || 0;
				const newCount = currentCount + 1;
				deleteCountCache.set(guildId, newCount);

				// 3번 지우면 알려주기
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
