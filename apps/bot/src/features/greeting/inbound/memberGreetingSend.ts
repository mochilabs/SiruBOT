import { container } from '@sapphire/framework';
import { memberGreetingSendEvent } from '@sirubot/utils';
import { createRedisEventListener, type RedisBinding } from '../../../lib/redisResponder.ts';

/**
 * 멤버 인사 테스트 전송 트리거 리스너 — 대시보드 테스트 버튼 → data-api가 pending 키를 쓰고
 * `sirubot:member-greeting:send` 채널로 {guildId, requestId}를 브로드캐스트하면, 이 리스너가
 * memberGreetingService.applyForGuild를 호출해요 (길드 보유 확인·pending 읽기·전송·결과 퍼블리시는 서비스가 해요).
 * 실패해도 프로세스를 크래시시키지 않아요 — 실제 입퇴장 인사는 별도 리스너가 이어서 처리해요.
 */
export function createMemberGreetingSendListener(): RedisBinding {
	return createRedisEventListener(memberGreetingSendEvent, async ({ event }) => {
		await container.memberGreetingService.applyForGuild(event.guildId, event.requestId ?? null);
	});
}
