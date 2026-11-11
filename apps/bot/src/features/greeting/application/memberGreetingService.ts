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
 * - 트리거 구독은 features/dashboard-bridge가 아니라 features/greeting/inbound가 공유 구독 연결 위에서 받아 이 서비스를 호출해요.
 * - 전송은 실패해도 프로세스를 크래시시키지 않아요 — 로그로만 남겨요.
 * - 실제 입퇴장 이벤트에서는 문제를 사용자에게 알리지 않고 로그로만 남겨요.
 *   (이미지 렌더 실패 시에는 텍스트 메시지로 폴백해요 — 인사 자체는 이어가요)
 * - 테스트 전송은 폴백 없이 결과를 있는 그대로 상태로 알려요.
 * - pending 키는 TTL(120초)이 있어 봇이 모두 무시해도 자동 정리돼요.
 */
import {
	DEFAULT_GREETINGS,
	GreetingConfig,
	GreetingKind,
	memberGreetingPendingKey,
	memberGreetingStateEvent,
	renderGreetingTemplate,
	validateGreetingConfig
} from '@sirubot/utils';
import { unwrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import {
	AttachmentBuilder,
	Guild,
	GuildMember,
	MessageFlags,
	PermissionFlagsBits,
	type MessageCreateOptions,
	type SendableChannels
} from 'discord.js';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { RedisPublisher } from '../../../lib/redisPublisher.ts';

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
interface MemberGreetingTestState {
	requestId: string;
	kind: GreetingKind;
	ok: boolean;
	/** 실패 때만 담아요 */
	error?: string;
	/** 전송 시각 — epoch milliseconds (number). data-api 허브와 대시보드 상태 계약이 number예요. */
	sentAt: number;
}

interface PendingPayload {
	kind?: unknown;
	userId?: unknown;
	requestId?: unknown;
}

/** 메시지 컴포넌트 렌더링 입력 — 구현(features/greeting/discord/views/greeting.ts)의 입력과 같은 모양이에요 */
export interface GreetingMessageInput {
	kind: GreetingKind;
	isTest: boolean;
	content: string;
	/** 카드 이미지 첨부 파일 이름 — 이미지가 없으면 null */
	imageFilename: string | null;
	avatarUrl: string | null;
	layout: 'container' | 'components';
	accentColor: string | null;
}

/** 인사 메시지 렌더링 포트 — 실제 구현은 features/greeting/discord/greetingMessages.ts예요. */
export interface GreetingMessagePort {
	components(input: GreetingMessageInput): NonNullable<MessageCreateOptions['components']>;
}

/** 멤버 인사 카드 렌더에 박을 멤버/서버 컨텍스트 */
export interface GreetingCardContext {
	userId: string;
	username: string;
	displayName: string;
	guildName: string | null;
	avatarUrl: string | null;
	memberCount: number;
}

/** pending 키 읽기·삭제에 쓰는 Redis 면 */
export interface GreetingPendingStore {
	getCacheValue(key: string): Promise<string | null>;
	deleteCacheValue(key: string): Promise<void>;
}

export interface MemberGreetingServiceDeps {
	logger: AppLogger;
	/** Redis 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY. 비어 있으면 서명 없는 구버전 모드(개발용). */
	signingKey: string;
	/** 테스트 전송 결과 퍼블리시 — 서명 봉투는 publisher가 감싸요 */
	publisher: Pick<RedisPublisher, 'publish'>;
	/** 호출 시점에 읽어요 — redisStore는 setupServices 뒤에 만들어져요 */
	getPendingStore: () => GreetingPendingStore | undefined;
	/** 이 프로세스가 보유한 길드(캐시)만 돌려줘요 */
	getGuild(guildId: string): Guild | undefined;
	/** 길드 설정 캐시에서 welcome/goodbye 원본을 읽어요 */
	getGuildSettings(guildId: string): Promise<{ welcome: unknown; goodbye: unknown }>;
	/** 카드 이미지 렌더(data-api) — 실패·미설정이면 null */
	renderMemberCard(guildId: string, kind: GreetingKind, config: GreetingConfig, context: GreetingCardContext): Promise<Buffer | null>;
	messages: GreetingMessagePort;
}

export class MemberGreetingService {
	public constructor(private readonly deps: MemberGreetingServiceDeps) {}

	private get logger(): AppLogger {
		return this.deps.logger;
	}

	/** 이 프로세스가 길드를 보유하면 pending 키를 읽어 테스트 인사를 보내고, 결과를 상태로 퍼블리시해요 */
	public async applyForGuild(guildId: string, broadcastRequestId: string | null): Promise<void> {
		const store = this.deps.getPendingStore();
		if (!store) {
			this.logger.warn(`멤버 인사 테스트 전송을 위한 redisStore가 없어요 (guild ${guildId})`);
			return;
		}
		const guild = this.deps.getGuild(guildId);
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
		const pendingBody = unwrapRedisMessage(this.deps.signingKey, rawPending);
		if (pendingBody === null) {
			this.logger.warn(`멤버 인사 pending 페이로드 서명 검증 실패, 무시 (guild ${guildId})`);
		} else {
			try {
				const parsed = JSON.parse(pendingBody) as PendingPayload;
				if (typeof parsed === 'object' && parsed !== null) pending = parsed;
			} catch {
				pending = null;
			}
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

	/** 테스트 전송 결과를 상태 채널로 퍼블리시해요 */
	private publishTestResult(guildId: string, requestId: string, kind: GreetingKind, result: GreetingSendResult): void {
		const state: MemberGreetingTestState = {
			requestId,
			kind,
			ok: result.ok,
			sentAt: Date.now()
		};
		if (result.error) state.error = result.error;
		// SEC-006: data-api 허브가 fail-closed 검증을 하므로 publisher가 서명 봉투로 감싸 보내요.
		this.deps.publisher.publish(memberGreetingStateEvent.channel(guildId), state, `Member greeting state (guild ${guildId})`);
		this.logger.debug(`멤버 인사 테스트 결과 퍼블리시 (guild ${guildId}, kind ${kind}, ok ${result.ok})`);
	}

	/**
	 * Guild 캐시에서 welcome/goodbye 설정을 읽고 검증해요.
	 * 없거나 깨진 값은 기본값(enabled=false)으로 폴백해요 — 대시보드 설정이 저장되면
	 * guildSettingsInvalidator가 캐시를 비워 다음 조회에서 최신 값을 읽어요.
	 */
	public async getConfig(guildId: string, kind: GreetingKind): Promise<GreetingConfig> {
		const guild = await this.deps.getGuildSettings(guildId);
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
		const guild = this.deps.getGuild(guildId);
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
			png = await this.deps.renderMemberCard(guildId, kind, config, {
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

		const filename = `greeting-${kind}.png`;
		const files: AttachmentBuilder[] = png ? [new AttachmentBuilder(png, { name: filename })] : [];
		const components = this.deps.messages.components({
			kind,
			isTest: opts.isTest,
			content,
			imageFilename: png ? filename : null,
			avatarUrl: member.avatarUrl,
			layout: config.layout,
			accentColor: config.accentColor
		});

		try {
			await channel.send({
				components,
				files,
				flags: [MessageFlags.IsComponentsV2],
				// @everyone/@here·역할 멘션 전파 차단 — 인사 대상 멤버만 핑해요 (템플릿에 멘션을 써도 안전해요)
				allowedMentions: { parse: [], users: [member.user.id] }
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
}

export function createMemberGreetingService(deps: MemberGreetingServiceDeps): MemberGreetingService {
	return new MemberGreetingService(deps);
}
