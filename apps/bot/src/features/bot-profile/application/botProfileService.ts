import { botProfilePendingKey, botProfileStateEvent } from '@sirubot/utils';
import { unwrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { Guild, PermissionFlagsBits } from 'discord.js';
import type { RedisStore } from '../../music/index.ts';
import type { RedisPublisher } from '../../../lib/redisPublisher.ts';
import type { ServiceLogger } from '../../../services/types.ts';

export interface BotProfileState {
	guildId: string;
	nickname: string | null;
	username: string;
	guildAvatarUrl: string | null;
	guildBannerUrl: string | null;
	globalAvatarUrl: string | null;
	canChangeNickname: boolean;
	lastApply: { ok: boolean; error: string | null; at: number } | null;
	updatedAt: number;
}

interface PendingPayload {
	nickname?: string | null;
	avatar?: string | null;
	banner?: string | null;
}

export interface BotProfileServiceDeps {
	logger: ServiceLogger;
	signingKey: string;
	publisher: Pick<RedisPublisher, 'publish'>;
	getRedisStore: () => Pick<RedisStore, 'getCacheValue' | 'deleteCacheValue'> | undefined;
	getGuild: (guildId: string) => Guild | undefined;
	getBotUsername: () => string | undefined;
}

export class BotProfileService {
	private readonly lastApplies = new Map<string, { ok: boolean; error: string | null; at: number }>();
	private readonly maxLastApplies = 2_000;

	public constructor(private readonly deps: BotProfileServiceDeps) {}

	public async refreshForGuild(guildId: string): Promise<void> {
		const guild = this.deps.getGuild(guildId);
		if (!guild) return;
		try {
			await guild.members.fetchMe({ force: true });
			this.publishGuildProfileFromGuild(guild);
		} catch (error) {
			this.deps.logger.warn(`봇 프로필 최신 상태 조회 실패 (guild ${guildId}): ${error}`);
		}
	}

	public async applyForGuild(guildId: string): Promise<void> {
		const publish = this.deps.getRedisStore();
		if (!publish) {
			this.deps.logger.warn(`봇 프로필 적용을 위한 redisStore가 없어요 (guild ${guildId})`);
			return;
		}
		const guild = this.deps.getGuild(guildId);
		if (!guild) return;

		let rawPending: string | null = null;
		try {
			rawPending = await publish.getCacheValue(botProfilePendingKey(guildId));
			// 읽은 즉시 지워요 — 롤링 재시작으로 두 프로세스가 잠깐 같은 길드를 보유해도 중복 적용을 막아요
			await publish.deleteCacheValue(botProfilePendingKey(guildId));
		} catch (error) {
			this.deps.logger.warn(`봇 프로필 pending 읽기 실패 (guild ${guildId}): ${error}`);
		}

		if (!rawPending) {
			this.deps.logger.debug(`봇 프로필 pending 없음 (guild ${guildId})`);
			return;
		}

		let payload: PendingPayload = {};
		const pendingBody = unwrapRedisMessage(this.deps.signingKey, rawPending);
		if (pendingBody === null) {
			this.deps.logger.warn(`봇 프로필 pending 페이로드 서명 검증 실패 (guild ${guildId})`);
		} else {
			try {
				const parsed = JSON.parse(pendingBody) as PendingPayload;
				if (typeof parsed === 'object' && parsed !== null) payload = parsed;
			} catch {
				this.deps.logger.warn(`봇 프로필 pending 페이로드 파싱 실패 (guild ${guildId})`);
				payload = {};
			}
		}

		const hasNickname = 'nickname' in payload;
		const hasAvatar = 'avatar' in payload;
		const hasBanner = 'banner' in payload;
		if (!hasNickname && !hasAvatar && !hasBanner) {
			this.deps.logger.debug(`봇 프로필 pending 변경점 없음 (guild ${guildId})`);
			return;
		}

		const startedAt = Date.now();
		const updates: { nick?: string | null; avatar?: string | null; banner?: string | null } = {};
		if (hasNickname) updates.nick = typeof payload.nickname === 'string' ? payload.nickname : null;
		if (hasAvatar) updates.avatar = typeof payload.avatar === 'string' ? payload.avatar : null;
		if (hasBanner) updates.banner = typeof payload.banner === 'string' ? payload.banner : null;

		try {
			const me = guild.members.me ?? (await guild.members.fetchMe());
			if (hasNickname && !(me.permissions.has(PermissionFlagsBits.ChangeNickname) || me.permissions.has(PermissionFlagsBits.ManageNicknames))) {
				this.recordLastApply(guildId, { ok: false, error: 'missing_permission', at: startedAt });
			} else {
				await guild.members.editMe(updates);
				this.recordLastApply(guildId, { ok: true, error: null, at: startedAt });
				this.deps.logger.info(`봇 프로필 적용 완료: ${guildId} (nickname: ${hasNickname}, avatar: ${hasAvatar}, banner: ${hasBanner})`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.deps.logger.warn(`봇 프로필 Discord 적용 실패 (guild ${guildId}): ${message}`);
			this.recordLastApply(guildId, { ok: false, error: message, at: startedAt });
		}

		this.publishGuildProfile(guildId);
	}

	private recordLastApply(guildId: string, entry: { ok: boolean; error: string | null; at: number }): void {
		if (!this.lastApplies.has(guildId) && this.lastApplies.size >= this.maxLastApplies) {
			// 가장 오래된 엔트리 하나를 비워요 — 장기 실행 메모리 누수 방지.
			const oldestKey = [...this.lastApplies.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
			if (oldestKey) this.lastApplies.delete(oldestKey);
		}
		this.lastApplies.set(guildId, entry);
	}

	public publishGuildProfile(guildId: string): void {
		const guild = this.deps.getGuild(guildId);
		if (!guild) return;
		this.publishGuildProfileFromGuild(guild);
	}

	public publishGuildProfileFromGuild(guild: Guild): void {
		try {
			const me = guild.members.me;
			if (!me) {
				// READY 직후 캐시가 아직 차 있지 않을 수 있어요 — 다음 이벤트에서 다시 퍼블리시해요.
				this.deps.logger.debug(`봇 멤버 캐시 미완성, 상태 퍼블리시 스킵 (guild ${guild.id})`);
				return;
			}

			const state: BotProfileState = {
				guildId: guild.id,
				nickname: me.nickname,
				username: me.user?.username ?? this.deps.getBotUsername() ?? '',
				guildAvatarUrl: me.avatarURL({ extension: 'png', size: 512 }),
				guildBannerUrl: me.bannerURL({ extension: 'png', size: 1024 }),
				globalAvatarUrl: me.user?.displayAvatarURL({ extension: 'png', size: 512 }) ?? null,
				canChangeNickname: me.permissions.has(PermissionFlagsBits.ChangeNickname) || me.permissions.has(PermissionFlagsBits.ManageNicknames),
				lastApply: this.lastApplies.get(guild.id) ?? null,
				updatedAt: Date.now()
			};

			this.deps.publisher.publish(botProfileStateEvent.channel(guild.id), state, `Bot profile state (guild ${guild.id})`);
		} catch (error) {
			this.deps.logger.debug(`봇 프로필 상태 퍼블리시 실패 (guild ${guild.id}): ${error}`);
		}
	}
}
