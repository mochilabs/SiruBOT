/**
 * 멤버 인사(환영/작별) 서비스 — 실제 입퇴장 전송과 대시보드 테스트 전송을 담당해요.
 *
 * 실제 이벤트: guildMemberAdd/Remove 리스너가 멤버 정보를 만들어 dispatch()를 호출하면,
 *   GuildService 캐시(Guild.welcome / Guild.goodbye Json)의 설정을 검증해 enabled일 때만
 *   설정한 채널로 메시지(이미지 카드 옵션 시 data-api 렌더 PNG)를 보내요.
 *
 * 테스트 전송: 대시보드 테스트 버튼 → data-api가 Redis `sirubot:member-greeting:pending:{guildId}`
 *   키에 {kind,userId,requestId}를 적어 두고 `sirubot:member-greeting:send` 채널로
 *   {guildId,requestId}를 브로드캐스트하면, 그 길드를 보유한 봇 프로세스만 이 서비스가
 *   pending 키를 읽고(즉시 삭제해 선점) 멤버를 실제로 조회해 카드를 렌더링해 전송한 뒤
 *   결과를 `sirubot:member-greeting:state:{guildId}`로 퍼블리시해요.
 *
 * - 구독/전송은 실패해도 프로세스를 크래시시키지 않아요 — 재구성·로그로만 남겨요.
 * - 실제 입퇴장 이벤트에서는 문제를 사용자에게 알리지 않고 로그로만 남겨요.
 *   (이미지 렌더 실패 시에는 텍스트 메시지로 폴백해요 — 인사 자체는 이어가요)
 * - 테스트 전송은 폴백 없이 결과를 있는 그대로 상태로 알려요.
 * - pending 키는 TTL(120초)이 있어 봇이 모두 무시해도 자동 정리돼요.
 */
import { container } from '@sapphire/framework';
import {
	addSeparator,
	createContainer,
	createThumbnail,
	DEFAULT_GREETINGS,
	GreetingConfig,
	GreetingKind,
	MEMBER_GREETING_SEND_CHANNEL,
	memberGreetingPendingKey,
	renderGreetingTemplate,
	validateGreetingConfig
} from '@sirubot/utils';
import { createClient, type RedisClientType } from '@redis/client';
import {
	AttachmentBuilder,
	Guild,
	GuildMember,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	MessageFlags,
	PermissionFlagsBits,
	SectionBuilder,
	SendableChannels,
	TextDisplayBuilder
} from 'discord.js';
import { renderMemberCard } from './dataApiClient.ts';

/** 멤버 인사에 필요한 멤버 정보 — 리스너/테스트 흐름이 만들어 전달해요 */
export interface GreetingMemberInfo {
	/** 인사 대상 유저 — 카드 렌더 ctx의 username에 써요 */
	user: { id: string; username: string };
	displayName: string;
	/** 메시지 본문 {유저} 치환에 쓰는 멘션 (예: `<@id>`) */
	mention: string;
	/** 카드/썸네일 아바타 URL — 없으면 null */
	avatarUrl: string | null;
}

/** send() 결과 — 테스트 흐름은 이 값을 상태로 퍼블리시해요 */
export interface GreetingSendResult {
	ok: boolean;
	/** ok=false일 때 실패 사유 — 사용자 화면에 그대로 보여줘요 */
	error?: string;
}

/** 인사 테스트 전송 결과 상태 페이로드 — data-api/대시보드 인사 패널과 계약이에요 */
export interface MemberGreetingTestState {
	requestId: string;
	kind: GreetingKind;
	ok: boolean;
	/** 실패 때만 담아요 */
	error?: string;
	/** ISO 8601 */
	sentAt: string;
}

interface SendBroadcastPayload {
	guildId?: unknown;
	requestId?: unknown;
}

interface PendingPayload {
	kind?: unknown;
	userId?: unknown;
	requestId?: unknown;
}

/** 서비스 주입 로거 — botProfileService와 같은 구조예요 */
interface ServiceLogger {
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
	debug(msg: string): void;
}

const RECONNECT_DELAY_MS = 5_000;
const RECONNECT_MAX_DELAY_MS = 60_000;

export class MemberGreetingService {
	private subscriber: RedisClientType | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectAttempts = 0;
	private stopped = false;
	private redisUrl: string | null = null;

	public constructor(private readonly logger: ServiceLogger) {}

	/** 구독을 시작해요. 실패해도 throw하지 않아요 — 재연결을 시도하고 테스트 전송만 비활성돼요. */
	public async start(redisUrl: string | undefined): Promise<void> {
		this.redisUrl = redisUrl?.trim() || null;
		if (!this.redisUrl) {
			this.logger.warn('REDIS_URL 미설정: 멤버 인사 테스트 전송 구독 없이 동작해요 (실제 입퇴장 인사는 계속돼요)');
			return;
		}
		await this.connectOnce();
	}

	private async connectOnce(): Promise<void> {
		if (this.stopped || !this.redisUrl) return;
		const previous = this.subscriber;
		try {
			const client = createClient({ url: this.redisUrl }) as RedisClientType;
			client.on('error', (error) => this.logger.warn(`멤버 인사 구독 오류: ${error.message}`));
			client.on('end', () => {
				if (this.subscriber === client) {
					this.subscriber = null;
					void this.scheduleReconnect();
				}
			});

			await client.connect();
			await client.subscribe(MEMBER_GREETING_SEND_CHANNEL, (raw) => {
				void this.handleSendBroadcast(raw);
			});

			this.subscriber = client;
			this.reconnectAttempts = 0;
			this.logger.info(`멤버 인사 테스트 전송 구독 시작: ${MEMBER_GREETING_SEND_CHANNEL}`);
		} catch (error) {
			this.subscriber = this.subscriber === previous ? null : this.subscriber;
			this.logger.warn(`멤버 인사 구독 실패, 재연결 예약: ${error instanceof Error ? error.message : String(error)}`);
			await this.scheduleReconnect();
		} finally {
			if (previous && previous !== this.subscriber) {
				await previous.quit().catch(() => undefined);
			}
		}
	}

	private scheduleReconnect(): void {
		if (this.stopped || this.reconnectTimer) return;
		const delay = Math.min(RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_DELAY_MS);
		this.reconnectAttempts++;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			void this.connectOnce();
		}, delay);
	}

	private async handleSendBroadcast(raw: string): Promise<void> {
		let guildId: string | null = null;
		let broadcastRequestId: string | null = null;
		try {
			const parsed = JSON.parse(raw) as SendBroadcastPayload;
			if (typeof parsed?.guildId === 'string' && parsed.guildId.length > 0 && parsed.guildId.length <= 32) {
				guildId = parsed.guildId;
			}
			if (typeof parsed?.requestId === 'string' && parsed.requestId.length > 0 && parsed.requestId.length <= 64) {
				broadcastRequestId = parsed.requestId;
			}
		} catch {
			guildId = null;
		}
		if (!guildId) {
			this.logger.debug(`멤버 인사 페이로드 형식 불일치, 무시: ${raw.slice(0, 100)}`);
			return;
		}

		await this.applyForGuild(guildId, broadcastRequestId).catch((error) => {
			this.logger.error(`멤버 인사 테스트 전송 중 예기치 못한 오류 (guild ${guildId}): ${error}`);
		});
	}

	/** 이 프로세스가 길드를 보유하면 pending 키를 읽어 테스트 인사를 보내고, 결과를 상태로 퍼블리시해요 */
	private async applyForGuild(guildId: string, broadcastRequestId: string | null): Promise<void> {
		const store = container.redisStore;
		if (!store) {
			this.logger.warn(`멤버 인사 테스트 전송을 위한 redisStore가 없어요 (guild ${guildId})`);
			return;
		}
		const guild = container.client.guilds.cache.get(guildId);
		if (!guild) return; // 다른 레플리카가 보유한 길드 — pending 키는 그쪽이 읽어요

		let rawPending: string | null = null;
		try {
			rawPending = await store.getCacheValue(memberGreetingPendingKey(guildId));
			// 읽은 즉시 지워요 — 롤링 재시작으로 두 프로세스가 잠깐 같은 길드를 보유해도 중복 전송을 막아요
			await store.deleteCacheValue(memberGreetingPendingKey(guildId));
		} catch (error) {
			this.logger.warn(`멤버 인사 pending 읽기 실패 (guild ${guildId}): ${error}`);
		}
		if (!rawPending) {
			this.logger.debug(`멤버 인사 pending 없음 (guild ${guildId})`);
			return;
		}

		let pending: PendingPayload | null = null;
		try {
			const parsed = JSON.parse(rawPending) as PendingPayload;
			if (typeof parsed === 'object' && parsed !== null) pending = parsed;
		} catch {
			pending = null;
		}
		if (!pending || (pending.kind !== 'welcome' && pending.kind !== 'goodbye') || typeof pending.userId !== 'string') {
			this.logger.warn(`멤버 인사 pending 페이로드 형식 불일치, 무시 (guild ${guildId})`);
			return;
		}
		const kind = pending.kind as GreetingKind;
		const requestId = typeof pending.requestId === 'string' && pending.requestId.length > 0 ? pending.requestId : (broadcastRequestId ?? '');

		let member: GuildMember | null = null;
		try {
			member = await guild.members.fetch(pending.userId);
		} catch {
			member = null;
		}
		if (!member) {
			this.publishTestResult(guildId, requestId, kind, { ok: false, error: '요청자를 이 서버에서 찾지 못했어요' });
			return;
		}

		const config = await this.getConfig(guildId, kind);
		if (!config.channelId) {
			this.publishTestResult(guildId, requestId, kind, {
				ok: false,
				error: '인사 채널이 설정되지 않았어요. 설정 화면에서 채널을 지정해 주세요'
			});
			return;
		}

		const result = await this.send(
			guildId,
			kind,
			{
				user: { id: member.id, username: member.user?.username ?? member.displayName },
				displayName: member.displayName,
				mention: member.toString(),
				avatarUrl: member.displayAvatarURL({ size: 256, extension: 'png' })
			},
			guild.memberCount,
			config,
			{ isTest: true }
		).catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }));
		this.publishTestResult(guildId, requestId, kind, result);
	}

	/** 테스트 전송 결과를 상태 채널로 퍼블리시해요 (redisStore 없으면 로그만 남겨요) */
	private publishTestResult(guildId: string, requestId: string, kind: GreetingKind, result: GreetingSendResult): void {
		const store = container.redisStore;
		if (!store) {
			this.logger.warn(`멤버 인사 테스트 결과 퍼블리시를 위한 redisStore가 없어요 (guild ${guildId})`);
			return;
		}
		const state: MemberGreetingTestState = {
			requestId,
			kind,
			ok: result.ok,
			sentAt: new Date().toISOString()
		};
		if (result.error) state.error = result.error;
		store.publishMemberGreetingState(guildId, JSON.stringify(state));
		this.logger.debug(`멤버 인사 테스트 결과 퍼블리시 (guild ${guildId}, kind ${kind}, ok ${result.ok})`);
	}

	/**
	 * Guild 캐시에서 welcome/goodbye 설정을 읽고 검증해요.
	 * 없거나 깨진 값은 기본값(enabled=false)으로 폴백해요 — 대시보드 설정이 저장되면
	 * guildSettingsInvalidator가 캐시를 비워 다음 조회에서 최신 값을 읽어요.
	 */
	public async getConfig(guildId: string, kind: GreetingKind): Promise<GreetingConfig> {
		const guild = await container.guildService.getGuild(guildId);
		const raw = kind === 'welcome' ? guild.welcome : guild.goodbye;
		return validateGreetingConfig(raw) ?? DEFAULT_GREETINGS[kind];
	}

	/** 실제 입퇴장 이벤트에서 인사를 보내요 — 문제는 로그로만 남기고 절대 throw하지 않아요. */
	public async dispatch(guild: Guild, kind: GreetingKind, member: GreetingMemberInfo): Promise<void> {
		try {
			const config = await this.getConfig(guild.id, kind);
			if (!config.enabled) return;
			if (!config.channelId) return; // 채널 미설정 — 실제 이벤트에서는 조용히 건너뛰어요

			const result = await this.send(guild.id, kind, member, guild.memberCount, config, {
				isTest: false
			});
			if (!result.ok) {
				this.logger.warn(`멤버 인사 전송 실패 (guild ${guild.id}, kind ${kind}): ${result.error ?? '원인을 알 수 없어요'}`);
			}
		} catch (error) {
			this.logger.warn(`멤버 인사 처리 중 오류 (guild ${guild.id}, kind ${kind}): ${error}`);
		}
	}

	/**
	 * 인사 메시지 1건을 보내요. 테스트 흐름(isTest=true)은 이미지 렌더 실패를 폴백하지 않고
	 * 실패로 보고해요 — 실제 이벤트는 텍스트 메시지로 폴백해 인사를 이어가요.
	 */
	public async send(
		guildId: string,
		kind: GreetingKind,
		member: GreetingMemberInfo,
		memberCount: number,
		config: GreetingConfig,
		opts: { isTest: boolean }
	): Promise<GreetingSendResult> {
		const guild = container.client.guilds.cache.get(guildId);
		if (!guild) return { ok: false, error: '봇이 그 서버의 최신 정보를 갖고 있지 않아요' };

		const channelOrError = await this.resolveSendableChannel(guild, config);
		if (typeof channelOrError === 'string') return { ok: false, error: channelOrError };
		const channel = channelOrError;

		const content = renderGreetingTemplate(config.template, {
			mention: member.mention,
			displayName: member.displayName,
			guildName: guild.name,
			memberCount
		});

		let png: Buffer | null = null;
		if (config.useImage && config.image) {
			png = await renderMemberCard(guildId, kind, config, {
				userId: member.user.id,
				username: member.user.username,
				displayName: member.displayName,
				guildName: guild.name,
				avatarUrl: member.avatarUrl,
				memberCount
			});
		}

		const hasContent = content.trim().length > 0;
		if (config.useImage && config.image && !png && opts.isTest) {
			// 테스트는 폴백 없이 실패를 알려요. 실제 이벤트는 텍스트로 이어가요.
			return { ok: false, error: '카드 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요' };
		}
		if (!png && !hasContent) return { ok: false, error: '인사 문구가 비어 있어요. 설정 화면에서 템플릿을 확인해 주세요' };
		if (config.useImage && config.image && !png) {
			this.logger.warn(`멤버 인사 카드 렌더 실패, 텍스트로 폴백 (guild ${guildId}, kind ${kind})`);
		}

		const containerComponent = createContainer();
		if (opts.isTest) {
			containerComponent.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(`-# ${kind === 'welcome' ? '확인용 환영 메시지예요' : '확인용 작별 메시지예요'}`)
			);
			addSeparator(containerComponent);
		}
		if (hasContent) {
			if (png) {
				containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
			} else if (member.avatarUrl) {
				const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
				section.setThumbnailAccessory(createThumbnail(member.avatarUrl));
				containerComponent.addSectionComponents(section);
			} else {
				containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
			}
		}

		const filename = `greeting-${kind}.png`;
		const files: AttachmentBuilder[] = [];
		if (png) {
			files.push(new AttachmentBuilder(png, { name: filename }));
			containerComponent.addMediaGalleryComponents(
				new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${filename}`))
			);
		}

		try {
			await channel.send({
				components: [containerComponent],
				files,
				flags: [MessageFlags.IsComponentsV2]
			});
		} catch (error) {
			return { ok: false, error: `메시지 전송에 실패했어요 (${error instanceof Error ? error.message : String(error)})` };
		}
		return { ok: true };
	}

	/** 설정 채널을 찾고 봇 권한(ViewChannel·SendMessages, 이미지면 AttachFiles)을 확인해요 — 실패 사유는 문자열 */
	private async resolveSendableChannel(guild: Guild, config: GreetingConfig): Promise<SendableChannels | string> {
		const channel = config.channelId ? guild.channels.cache.get(config.channelId) : null;
		if (!channel?.isSendable()) {
			return '인사 채널을 이 서버에서 찾지 못했어요. 삭제되지 않았는지 설정 화면에서 확인해 주세요';
		}
		if (!('permissionsFor' in channel)) {
			return '봇이 그 채널에서 메시지를 보낼 수 있는지 확인하지 못했어요';
		}
		const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
		if (!me) return '봇이 그 채널에서 메시지를 보낼 수 있는지 확인하지 못했어요';

		const permissions = channel.permissionsFor(me);
		if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions.has(PermissionFlagsBits.SendMessages)) {
			return '봇이 그 채널에서 메시지를 보낼 권한이 없어요. 채널 권한 설정에서 봇이 볼 수 있고 메시지를 보낼 수 있어야 해요';
		}
		if (config.useImage && config.image && !permissions.has(PermissionFlagsBits.AttachFiles)) {
			return '봇이 그 채널에 파일을 첨부할 권한이 없어요. 권한을 주거나 설정에서 이미지 사용을 꺼 주세요';
		}
		return channel;
	}

	/** 종료 — 구독 해제 후 연결을 닫아요. shutdown에서 redisStore.disconnect() 전에 불러야 해요. */
	public async stop(): Promise<void> {
		this.stopped = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		const client = this.subscriber;
		this.subscriber = null;
		if (!client) return;
		await client.unsubscribe(MEMBER_GREETING_SEND_CHANNEL).catch(() => undefined);
		await client.quit().catch(() => undefined);
	}
}

/** 프로세스 공용 인스턴스 — bootstrap에서 시작하고 shutdown에서 정리해요 */
export const memberGreetingService = new MemberGreetingService({
	info: (msg) => container.logger.info(msg),
	warn: (msg) => container.logger.warn(msg),
	error: (msg) => container.logger.error(msg),
	debug: (msg) => container.logger.debug(msg)
});
