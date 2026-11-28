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

export interface GreetingMemberInfo {
	user: { id: string; username: string };
	displayName: string;
	mention: string;
	avatarUrl: string | null;
}

export interface GreetingSendResult {
	ok: boolean;
	error?: string;
}

interface MemberGreetingTestState {
	requestId: string;
	kind: GreetingKind;
	ok: boolean;
	error?: string;
	sentAt: number;
}

interface PendingPayload {
	kind?: unknown;
	userId?: unknown;
	requestId?: unknown;
}

export interface GreetingMessageInput {
	kind: GreetingKind;
	isTest: boolean;
	content: string;
	imageFilename: string | null;
	avatarUrl: string | null;
	layout: 'container' | 'components';
	accentColor: string | null;
}

export interface GreetingMessagePort {
	components(input: GreetingMessageInput): NonNullable<MessageCreateOptions['components']>;
}

export interface GreetingCardContext {
	userId: string;
	username: string;
	displayName: string;
	guildName: string | null;
	avatarUrl: string | null;
	memberCount: number;
}

export interface GreetingPendingStore {
	getCacheValue(key: string): Promise<string | null>;
	deleteCacheValue(key: string): Promise<void>;
}

export interface MemberGreetingServiceDeps {
	logger: AppLogger;
	signingKey: string;
	publisher: Pick<RedisPublisher, 'publish'>;
	getPendingStore: () => GreetingPendingStore | undefined;
	getGuild(guildId: string): Guild | undefined;
	getGuildSettings(guildId: string): Promise<{ welcome: unknown; goodbye: unknown }>;
	renderMemberCard(
		guildId: string,
		kind: GreetingKind,
		config: GreetingConfig,
		context: GreetingCardContext
	): Promise<{ buffer: Buffer; contentType: string } | null>;
	messages: GreetingMessagePort;
	recordUsage?: (guildId: string, userId: string) => void;
}

export class MemberGreetingService {
	public constructor(private readonly deps: MemberGreetingServiceDeps) {}

	private get logger(): AppLogger {
		return this.deps.logger;
	}

	public async applyForGuild(guildId: string, broadcastRequestId: string | null): Promise<void> {
		const store = this.deps.getPendingStore();
		if (!store) {
			this.logger.warn(`멤버 인사 테스트 전송을 위한 redisStore가 없어요 (guild ${guildId})`);
			return;
		}
		const guild = this.deps.getGuild(guildId);
		if (!guild) return;

		let rawPending: string | null = null;
		try {
			rawPending = await store.getCacheValue(memberGreetingPendingKey(guildId));
			// 읽은 즉시 삭제해 롤링 재시작 중 중복 전송을 막아요
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

	private publishTestResult(guildId: string, requestId: string, kind: GreetingKind, result: GreetingSendResult): void {
		const state: MemberGreetingTestState = {
			requestId,
			kind,
			ok: result.ok,
			sentAt: Date.now()
		};
		if (result.error) state.error = result.error;
		this.deps.publisher.publish(memberGreetingStateEvent.channel(guildId), state, `Member greeting state (guild ${guildId})`);
		this.logger.debug(`멤버 인사 테스트 결과 퍼블리시 (guild ${guildId}, kind ${kind}, ok ${result.ok})`);
	}

	public async getConfig(guildId: string, kind: GreetingKind): Promise<GreetingConfig> {
		const guild = await this.deps.getGuildSettings(guildId);
		const raw = kind === 'welcome' ? guild.welcome : guild.goodbye;
		return validateGreetingConfig(raw) ?? DEFAULT_GREETINGS[kind];
	}

	public async dispatch(guild: Guild, kind: GreetingKind, member: GreetingMemberInfo): Promise<void> {
		try {
			const config = await this.getConfig(guild.id, kind);
			if (!config.enabled) return;
			if (!config.channelId) return;
			this.deps.recordUsage?.(guild.id, member.user.id);

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

		let card: { buffer: Buffer; contentType: string } | null = null;
		if (config.useImage && config.image) {
			card = await this.deps.renderMemberCard(guildId, kind, config, {
				userId: member.user.id,
				username: member.user.username,
				displayName: member.displayName,
				guildName: guild.name,
				avatarUrl: member.avatarUrl,
				memberCount
			});
		}

		const hasContent = content.trim().length > 0;
		if (config.useImage && config.image && !card && opts.isTest) {
			return { ok: false, error: '카드 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요' };
		}
		if (!card && !hasContent) return { ok: false, error: '인사 문구가 비어 있어요. 설정 화면에서 템플릿을 확인해 주세요' };
		if (config.useImage && config.image && !card) {
			this.logger.warn(`멤버 인사 카드 렌더 실패, 텍스트로 폴백 (guild ${guildId}, kind ${kind})`);
		}

		// 애니메이션 카드는 .webp로 내려오므로 확장자를 content-type에 맞춰요
		const filename = `greeting-${kind}.${card?.contentType === 'image/webp' ? 'webp' : 'png'}`;
		const files: AttachmentBuilder[] = card ? [new AttachmentBuilder(card.buffer, { name: filename })] : [];
		const components = this.deps.messages.components({
			kind,
			isTest: opts.isTest,
			content,
			imageFilename: card ? filename : null,
			avatarUrl: member.avatarUrl,
			layout: config.layout,
			accentColor: config.accentColor
		});

		try {
			await channel.send({
				components,
				files,
				flags: [MessageFlags.IsComponentsV2],
				// @everyone/@here·역할 멘션 전파 차단
				allowedMentions: { parse: [], users: [member.user.id] }
			});
		} catch (error) {
			return { ok: false, error: `메시지 전송에 실패했어요 (${error instanceof Error ? error.message : String(error)})` };
		}
		return { ok: true };
	}

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
