/**
 * 패널 메시지(티켓·역할 패널) 게시 응답자 — 대시보드 직접 게시 요청 → data-api Redis → 봇 수행.
 *
 * 패널 메시지(커스텀 ID 버튼 포함)는 봇 토큰으로만 보낼 수 있어요. data-api panelPostHub가
 * REQUEST 채널(`sirubot:panel-post:request`)로 {requestId, guildId, type, panelId?, channelId}를
 * 브로드캐스트하면, 그 길드를 보유한 봇 프로세스만 패널을 게시한 뒤 RESPONSE 채널로 messageId를 응답해요.
 * 계약 하나를 type에 따라 두 feature 핸들러(tickets·role-panels)로 나눠 주는 얇은 디스패처예요.
 *
 * - 이 프로세스가 보유하지 않은 길드면 조용히 무시해요 — 다른 레플리카가 응답해요.
 * - 게시 실패(채널 없음·권한 부족)는 한국어 error로 응답해요. 한 길드의 게시는 동시에 하나만 처리해요.
 */
import { panelPostRpc } from '@sirubot/utils';
import { AppError } from '../../../lib/appError.ts';
import { discordApiErrorText } from '../../../lib/discordErrorText.ts';
import { createRedisResponder, type RedisBinding } from '../../../lib/redisResponder.ts';
import { PanelPostError, postRolePanel } from '../../role-panels/index.ts';
import { postTicketPanel } from '../../tickets/index.ts';

export function createPanelPostResponder(): RedisBinding {
	const inFlight = new Set<string>();
	return createRedisResponder(
		panelPostRpc,
		async ({ guild, request }) => {
			const { guildId, type, panelId, channelId, refresh } = request;
			if (inFlight.has(guildId)) {
				throw new AppError('conflict', `이 서버의 이전 패널 게시 요청을 아직 처리하고 있어요. 잠시 후 다시 시도해 주세요.`);
			}

			inFlight.add(guildId);
			try {
				const result =
					type === 'rolePanel' ? await postRolePanel(guild, { panelId, channelId, refresh }) : await postTicketPanel(guild, channelId);
				return { messageId: result?.messageId, channelId: result?.channelId };
			} catch (error) {
				// 게시 흐름이 던진 안내 문구는 가공 없이 그대로 전달해요 (대시보드가 기존 문구를 그대로 보여줘요).
				if (error instanceof PanelPostError) return { error: error.message };
				throw error;
			} finally {
				inFlight.delete(guildId);
			}
		},
		{
			errorMessage: (_request, error) =>
				discordApiErrorText(error, {
					permission: '메시지 전송 권한이 봇에 없어요. 서버 설정에서 봇 역할 권한을 확인해 주세요.',
					fallback: `패널을 게시하지 못했어요. 잠시 후 다시 시도해 주세요.`
				})
		}
	);
}
