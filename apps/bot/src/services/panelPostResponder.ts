import { container } from '@sapphire/framework';
import type { Guild } from 'discord.js';
import { emoji, PANEL_POST_REQUEST_CHANNEL, ManagedRedisSubscriber, panelPostRequestSchema, type PanelPostResponse } from '@sirubot/utils';
import { unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { ticketPanelView } from '../modules/general/view/ticket.ts';
import { discordApiErrorText } from '../lib/discordErrorText.ts';
import { deletePostedMessage, PanelPostError, resolvePanelChannel } from './rolePanelService.ts';
import type { ServiceLogger } from './types.ts';

/**
 * 패널 메시지(티켓·역할 패널) 게시 응답자 — 대시보드 직접 게시 요청 → data-api Redis → 봇 수행.
 *
 * 패널 메시지(커스텀 ID 버튼 포함)는 봇 토큰으로만 보낼 수 있어요. data-api panelPostHub가
 * REQUEST 채널(`sirubot:panel-post:request`)로 {requestId, guildId, type, panelId?, channelId}를
 * 브로드캐스트하면, 그 길드를 보유한 봇 프로세스만 패널을 게시한 뒤 RESPONSE 채널로 messageId를 응답해요.
 *
 * - 이 프로세스가 보유하지 않은 길드면 조용히 무시해요 — 다른 레플리카가 응답해요.
 * - 게시 실패(채널 없음·권한 부족)는 한국어 error로 응답해요.
 * - 어떤 경우에도 절대 throw하지 않아요 — 처리 실패는 대시보드의 타임아웃 폴백으로 이어져요.
 */
export class PanelPostResponder {
	private subscriber: ManagedRedisSubscriber | null = null;
	private readonly inFlight = new Set<string>();

	public constructor(
		private readonly logger: ServiceLogger,
		private readonly signingKey: string = ''
	) {}

	public async start(redisUrl: string | undefined): Promise<void> {
		const url = redisUrl?.trim() || null;
		if (!url) {
			this.logger.warn('REDIS_URL 미설정: 패널 게시 응답 없이 동작해요 (대시보드 직접 게시는 타임아웃 폴백해요)');
			return;
		}
		this.subscriber = new ManagedRedisSubscriber({
			name: '패널 게시',
			url,
			logger: this.logger,
			bindings: [
				{
					channel: PANEL_POST_REQUEST_CHANNEL,
					onMessage: (raw) => {
						const body = unwrapRedisMessage(this.signingKey, raw);
						if (body === null) {
							this.logger.warn('패널 게시 요청 거부: 서명 검증 실패');
							return;
						}
						void this.handleRequest(body);
					}
				}
			]
		});
		await this.subscriber.start();
	}

	public async stop(): Promise<void> {
		const subscriber = this.subscriber;
		this.subscriber = null;
		await subscriber?.stop();
	}

	private async handleRequest(raw: string): Promise<void> {
		let payload: unknown;
		try {
			payload = JSON.parse(raw);
		} catch {
			this.logger.debug(`패널 게시 요청이 JSON이 아니어서 무시: ${raw.slice(0, 100)}`);
			return;
		}
		const request = panelPostRequestSchema.safeParse(payload);
		if (!request.success) {
			this.logger.debug(`패널 게시 요청 페이로드 형식 불일치, 무시: ${raw.slice(0, 100)}`);
			return;
		}
		const guild = container.client.guilds.cache.get(request.data.guildId);
		if (!guild) return; // 다른 레플리카가 보유한 길드

		const { guildId, type, panelId, channelId, refresh } = request.data;
		if (this.inFlight.has(guildId)) {
			this.respond({
				requestId: request.data.requestId,
				guildId,
				error: `${emoji('bulb')} 이 서버의 이전 패널 게시 요청을 아직 처리하고 있어요. 잠시 후 다시 시도해 주세요.`
			});
			return;
		}

		this.inFlight.add(guildId);
		try {
			const result = await this.postPanel(guild, type, panelId, channelId, refresh === true);
			this.respond({
				requestId: request.data.requestId,
				guildId,
				messageId: result?.messageId,
				channelId: result?.channelId
			});
		} catch (error) {
			if (error instanceof PanelPostError) {
				this.respond({ requestId: request.data.requestId, guildId, error: error.message });
				return;
			}
			this.logger.error(`패널 게시 실패 (guild ${guildId}, type ${type}): ${error instanceof Error ? error.message : String(error)}`);
			this.respond({
				requestId: request.data.requestId,
				guildId,
				error: discordApiErrorText(error, {
					permission: '메시지 전송 권한이 봇에 없어요. 서버 설정에서 봇 역할 권한을 확인해 주세요.',
					fallback: `${emoji('error')} 패널을 게시하지 못했어요. 잠시 후 다시 시도해 주세요.`
				})
			});
		} finally {
			this.inFlight.delete(guildId);
		}
	}

	/**
	 * 패널 종류에 따라 게시하고, DB에 channelId/messageId를 기록해요.
	 * refresh 요청이 갱신할 게시물이 없어 아무것도 하지 않았다면 null이에요.
	 */
	private async postPanel(
		guild: Guild,
		type: 'ticket' | 'rolePanel',
		panelId: string | undefined,
		channelId: string | undefined,
		refresh: boolean
	): Promise<{ messageId: string; channelId: string } | null> {
		if (type === 'rolePanel') {
			if (!panelId) throw new PanelPostError(`${emoji('error')} 게시할 역할 패널을 지정해 주세요.`);
			return container.rolePanelService.publishPanel(guild, panelId, channelId, { refresh });
		}

		const config = await container.db.ticketConfig.findUnique({ where: { guildId: guild.id } });
		if (!config || !config.enabled) {
			throw new PanelPostError(`${emoji('error')} 티켓 기능이 꺼져 있어요. 먼저 티켓을 활성화해 주세요.`);
		}
		const channel = resolvePanelChannel(guild, channelId ?? config.panelChannelId);
		if (!channel) {
			throw new PanelPostError(`${emoji('error')} 게시할 텍스트 채널을 찾을 수 없어요. 채널을 선택해 주세요.`);
		}

		const message = await channel.send(ticketPanelView(config));
		await container.db.ticketConfig.update({
			where: { guildId: guild.id },
			data: { panelChannelId: channel.id, panelMessageId: message.id }
		});
		// 새 패널을 기록한 뒤 이전 패널 메시지를 지워 채널에 중복 패널이 남지 않게 해요.
		if (config.panelMessageId && config.panelMessageId !== message.id) {
			await deletePostedMessage(guild, config.panelChannelId, config.panelMessageId);
		}
		return { messageId: message.id, channelId: channel.id };
	}

	private respond(response: PanelPostResponse): void {
		const store = container.redisStore;
		if (!store) {
			this.logger.warn(`패널 게시 응답을 위한 redisStore가 없어요 (guild ${response.guildId})`);
			return;
		}
		store.publishPanelPostResponse(wrapRedisMessage(this.signingKey, response));
	}
}
