/**
 * 소셜 알림 웹훅 생성 응답자 — 대시보드 소셜 알림 구독 추가 → notifier → Redis → 봇 수행.
 *
 * Discord 웹훅 생성은 Manage Webhooks 권한이 필요해요 — 대시보드 유저 토큰으로는 만들 수
 * 없고 봇 토큰으로만 가능해요. 구독 추가 시점에 이 응답자가 대상 채널에 웹훅을 딱 한 번
 * 만들고 {webhookId, webhookToken}을 응답해요 — notifier가 그걸 DB에 저장하고, 이후 알림
 * 전송은 봇을 거치지 않고 웹훅으로 곧바로 가요. 봇은 이 생성 순간에만 관여해요.
 *
 * - 이 프로세스가 보유하지 않은 길드면 조용히 무시해요 — 다른 레플리카가 응답해요.
 *   아무도 응답하지 않으면 요청자(notifier)가 타임아웃으로 처리해요.
 * - 실패(채널 없음·권한 부족·웹훅 한도)는 한국어 error 메시지로 응답해요 — 대시보드가 그대로 안내해요.
 * - 수신·서명·검증·길드 확인·응답 골격은 lib/redisResponder.ts가 맡아요.
 */
import { DiscordAPIError } from 'discord.js';
import { socialWebhookCreateRpc } from '@sirubot/utils';
import { AppError } from '../../../lib/appError.ts';
import { discordApiErrorText } from '../../../lib/discordErrorText.ts';
import { createRedisResponder, type RedisBinding } from '../../../lib/redisResponder.ts';

/** Discord API 오류 코드 — 웹훅 한도 */
const DISCORD_MAX_WEBHOOKS = 220001;

/** 처리 흐름의 실패를 한국어 안내로 바꿔요 — 사용자가 고칠 수 있는 행동별로 구분해요 */
function toKoreanError(error: unknown): string {
	if (error instanceof DiscordAPIError && error.code === DISCORD_MAX_WEBHOOKS) {
		return `이 채널의 웹훅 한도(10개)가 가득 찼어요. 사용하지 않는 웹훅을 삭제한 뒤 다시 시도해 주세요.`;
	}
	return discordApiErrorText(error, {
		permission: '웹훅 생성 권한이 봇에 없어요. 서버 설정에서 봇 역할의 웹훅 관리 권한을 확인해 주세요.',
		fallback: `웹훅을 만들지 못했어요. 잠시 후 다시 시도해 주세요.`
	});
}

export function createSocialWebhookResponder(): RedisBinding {
	const inFlight = new Set<string>();
	return createRedisResponder(
		socialWebhookCreateRpc,
		async ({ guild, request, logger }) => {
			const { guildId, targetChannelId, name } = request;
			if (inFlight.has(guildId)) {
				throw new AppError('conflict', `이 서버의 이전 웹훅 생성 요청을 아직 처리하고 있어요. 잠시 후 다시 시도해 주세요.`);
			}

			inFlight.add(guildId);
			try {
				const channel = guild.channels.cache.get(targetChannelId);
				if (!channel) throw new AppError('not_found', `채널을 찾을 수 없어요.`);
				if (!('createWebhook' in channel)) {
					throw new AppError('invalid_input', `이 채널 종류에는 웹훅을 만들 수 없어요. 텍스트·음성 채널에서 선택해 주세요.`);
				}
				const webhook = await channel.createWebhook({ name, reason: '대시보드 소셜 알림 구독 추가' });
				if (!webhook.token) throw new AppError('unavailable', `웹훅 토큰을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.`);
				logger.info(`소셜 알림 웹훅 생성 완료 (guild ${guildId}, channel ${targetChannelId}, webhook ${webhook.id})`);
				return { webhookId: webhook.id, webhookToken: webhook.token };
			} finally {
				inFlight.delete(guildId);
			}
		},
		{ errorMessage: (_request, error) => toKoreanError(error) }
	);
}
