import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';

import { container } from '@sapphire/framework';

/**
 * READY — 캐시한 모든 길드의 봇 프로필 상태를 퍼블리시해요.
 * data-api 재시작으로 상태 허브가 비었을 때도 대시보드 패널이 값을 받을 수 있게 해요.
 * READY 직후 멤버 캐시가 늦게 차는 길드는 publishGuildProfileFromGuild이 스킵하고
 * 멤버 업데이트 이벤트에서 다시 퍼블리시해요.
 */
@ApplyOptions<Listener.Options>({ event: Events.ClientReady })
export class BotProfileReadyListener extends Listener {
	public override run() {
		const guilds = [...this.container.client.guilds.cache.values()];
		for (const guild of guilds) {
			container.botProfileService.publishGuildProfileFromGuild(guild);
		}
		this.container.logger.debug(`봇 프로필 상태 초기 퍼블리시: ${guilds.length}개 길드`);
	}
}
