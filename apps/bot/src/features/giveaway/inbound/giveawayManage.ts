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
