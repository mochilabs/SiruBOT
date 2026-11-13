import { container } from '@sapphire/framework';
import { botProfileRefreshEvent, botProfileSetEvent } from '@sirubot/utils';
import { createRedisEventListener, type RedisBinding } from '../../../lib/redisResponder.ts';

/**
 * 봇 프로필(닉네임·아바타) 트리거 리스너 — 대시보드 저장 → data-api가 pending 키를 쓰고
 * `sirubot:bot-profile:set`으로 guildId를 브로드캐스트하면 botProfileService가 적용해요.
 * 화면 조회/재시도 때는 `sirubot:bot-profile:refresh`로 최신 상태를 다시 퍼블리시해요.
 * 길드 보유 확인·pending 읽기·상태 퍼블리시는 서비스가 해요 (이 프로세스가 길드를 보유하지 않으면 조용히 끝나요).
 */
export function createBotProfileListeners(): RedisBinding[] {
	return [
		createRedisEventListener(botProfileSetEvent, async ({ event }) => {
			await container.botProfileService.applyForGuild(event.guildId);
		}),
		createRedisEventListener(botProfileRefreshEvent, async ({ event }) => {
			await container.botProfileService.refreshForGuild(event.guildId);
		})
	];
}
