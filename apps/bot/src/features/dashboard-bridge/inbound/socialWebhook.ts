import { DiscordAPIError } from 'discord.js';
import { socialWebhookCreateRpc } from '@sirubot/utils';
import { AppError } from '../../../lib/appError.ts';
import { discordApiErrorText } from '../../../lib/discordErrorText.ts';
import { createRedisResponder, type RedisBinding } from '../../../lib/redisResponder.ts';

const DISCORD_MAX_WEBHOOKS = 220001;

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
