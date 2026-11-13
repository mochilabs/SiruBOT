/**
 * 임시 방(JTC) 마커 채널 셋업 응답자 — 대시보드 설정 화면의 마커 채널 생성·이동 요청 → data-api Redis → 봇 수행.
 *
 * 마커 채널 생성과 카테고리 이동은 Discord 규격상 봇 토큰으로만 가능해요 (유저 OAuth 토큰에는
 * 길드 채널 관리 권한이 없어요). data-api jtcSetupHub가 Redis 채널(`sirubot:jtc-setup:request`)로
 * {requestId, guildId, categoryId}를 브로드캐스트하면, 그 길드를 보유한 봇 프로세스만 이 응답자가
 * tempVoiceService.setupMarkerChannel을 수행한 뒤 `sirubot:jtc-setup:response` 채널로 응답해요.
 *
 * - 이 프로세스가 보유하지 않은 길드면 조용히 무시해요 — 다른 레플리카가 응답해요.
 * - 검증 실패(카테고리 아님·채널 없음)와 봇 권한 부족은 한국어 error 메시지로 응답해요 —
 *   data-api가 그대로 400으로 전달해 대시보드에서 안내해요.
 * - 수신·서명·검증·길드 확인·응답 골격은 lib/redisResponder.ts가 맡아요.
 */
import { container } from '@sapphire/framework';
import { jtcSetupRpc } from '@sirubot/utils';
import { AppError } from '../../../lib/appError.ts';
import { discordApiErrorText } from '../../../lib/discordErrorText.ts';
import { createRedisResponder, type RedisBinding } from '../../../lib/redisResponder.ts';

/** 카테고리 채널이 아니거나 존재하지 않을 때 tempVoiceService가 던지는 오류 메시지 */
const NOT_CATEGORY_MESSAGE = 'selected channel is not a category';
/** 처리 흐름의 실패를 한국어 안내로 바꿔요 — 사용자가 고칠 수 있는 행동별로 구분해요 */
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
			const { guildId, categoryId } = request;
			if (inFlight.has(guildId)) {
				throw new AppError('conflict', `이 서버의 이전 마커 채널 설정 요청을 아직 처리하고 있어요. 잠시 후 다시 시도해 주세요.`);
			}
			inFlight.add(guildId);
			try {
				return { markerChannelId: await container.tempVoiceService.setupMarkerChannel(guildId, categoryId) };
			} finally {
				inFlight.delete(guildId);
			}
		},
		{ errorMessage: (_request, error) => toKoreanError(error) }
	);
}
