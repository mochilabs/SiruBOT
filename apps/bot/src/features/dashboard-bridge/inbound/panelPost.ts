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
