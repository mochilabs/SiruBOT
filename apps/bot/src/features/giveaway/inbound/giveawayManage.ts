/**
 * 나눔 관리 응답자 — 대시보드의 시작·종료·취소·다시 뽑기 요청 → data-api Redis → 봇 수행.
 *
 * 참여 카드(커스텀 ID 버튼 포함)와 결과 발표는 봇 토큰으로만 보낼 수 있어요. data-api giveawayHub가
 * REQUEST 채널(`sirubot:giveaway-manage:request`)로 요청을 브로드캐스트하면, 그 길드를 보유한 봇 프로세스만
 * 슬래시 명령과 같은 GiveawayService로 처리하고 RESPONSE 채널로 결과를 응답해요.
 * 서비스가 던지는 AppError는 응답자 골격이 한국어 안내(error)로 바꿔 줘요.
 */
import { giveawayManageRpc } from '@sirubot/utils';
import { AppError } from '../../../lib/appError.ts';
import { createRedisResponder, type RedisBinding } from '../../../lib/redisResponder.ts';
import type { GiveawayService } from '../application/giveawayService.ts';

export function createGiveawayManageResponder(getService: () => GiveawayService): RedisBinding {
	return createRedisResponder(giveawayManageRpc, async ({ request }) => {
		const service = getService();
		const { guildId } = request;
		switch (request.action) {
			case 'start': {
				const { id } = await service.start({
					guildId,
					channelId: request.channelId,
					userId: request.userId,
					prize: request.prize,
					winnerCount: request.winnerCount,
					endsAt: new Date(request.endsAt),
					conditions: request.conditions
				});
				return { giveawayId: id };
			}
			case 'end': {
				const result = await service.endNow(guildId, request.giveawayId);
				if (result !== 'ended') throw new AppError('not_found', '진행 중인 그 나눔을 찾지 못했어요.');
				return { giveawayId: request.giveawayId };
			}
			case 'cancel': {
				const result = await service.cancel(guildId, request.giveawayId);
				if (result !== 'cancelled') throw new AppError('not_found', '진행 중인 그 나눔을 찾지 못했어요.');
				return { giveawayId: request.giveawayId };
			}
			case 'reroll': {
				const { winnerIds } = await service.reroll(guildId, request.giveawayId, request.count);
				return { giveawayId: request.giveawayId, winnerIds };
			}
		}
	});
}
