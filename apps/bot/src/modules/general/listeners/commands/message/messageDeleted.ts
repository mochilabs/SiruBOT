import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { ContainerBuilder, Message } from 'discord.js';
import { DEFAULT_COLOR, MemoryCache } from '@sirubot/utils';
import { sleep } from '@sapphire/utilities';

const deleteCountCache = new MemoryCache<string, number>({
	maxSize: 100,
	ttl: 60 * 60 * 1000
});

@ApplyOptions<Listener.Options>({
	event: Events.MessageDelete
})
export class MessageDeleteListener extends Listener {
	public override async run(message: Message) {
		// Ignore audio is not initialized
		if (!this.container.audio) return;
		if (!message.guild?.id) return;

		const guildId = message.guild.id;

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
									new ContainerBuilder()
										.setAccentColor(DEFAULT_COLOR)
										.addTextDisplayComponents((t) =>
											t.setContent(
												`-# 💡 봇의 노래 재생 메세지가 불편하시다면, /설정 명령어로 **[오디오 컨트롤러]** 옵션을 끌 수 있어요.`
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
