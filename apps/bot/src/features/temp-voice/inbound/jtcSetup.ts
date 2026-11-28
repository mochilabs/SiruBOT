import { container } from '@sapphire/framework';
import { jtcSetupRpc } from '@sirubot/utils';
import { AppError } from '../../../lib/appError.ts';
import { discordApiErrorText } from '../../../lib/discordErrorText.ts';
import { createRedisResponder, type RedisBinding } from '../../../lib/redisResponder.ts';

const NOT_CATEGORY_MESSAGE = 'selected channel is not a category';
function toKoreanError(error: unknown): string {
	if (error instanceof Error && error.message.includes(NOT_CATEGORY_MESSAGE)) {
		return `카테고리 채널만 선택할 수 있어요.`;
	}
	return discordApiErrorText(error, {
		permission: '채널 생성·이동 권한이 봇에 없어요. 서버 설정에서 봇 역할 권한을 확인해 주세요.',
		fallback: `마커 채널을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.`
	});
}

export function createJtcSetupResponder(): RedisBinding {
	const inFlight = new Set<string>();
	return createRedisResponder(
		jtcSetupRpc,
		async ({ request }) => {
			const { guildId, categoryId, markerChannelName } = request;
			if (inFlight.has(guildId)) {
				throw new AppError('conflict', `이 서버의 이전 마커 채널 설정 요청을 아직 처리하고 있어요. 잠시 후 다시 시도해 주세요.`);
			}
			inFlight.add(guildId);
			try {
				const markerChannelId =
					markerChannelName !== undefined
						? await container.tempVoiceService.setupMarkerChannel(guildId, categoryId, markerChannelName)
						: await container.tempVoiceService.setupMarkerChannel(guildId, categoryId);
				return { markerChannelId };
			} finally {
				inFlight.delete(guildId);
			}
		},
		{ errorMessage: (_request, error) => toKoreanError(error) }
	);
}
