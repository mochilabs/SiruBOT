/**
 * 봇 프로필 서비스 — 길드별 봇 닉네임·아바타 적용 및 상태 퍼블리시.
 *
 * 대시보드 저장 → data-api가 Redis `sirubot:bot-profile:pending:{guildId}` 키에
 * 본문을 적어 두고 `sirubot:bot-profile:set` 채널로 guildId를 브로드캐스트하면,
 * 그 길드를 보유한 봇 프로세스만 이 서비스가 pending 키를 읽고(즉시 삭제해 선점)
 * discord.js `guild.members.editMe()`로 Discord API에 적용해요.
 *
 * 적용 결과(성공/실패 사유 포함)와 현재 상태는 `sirubot:bot-profile:state:{guildId}`
 * 채널로 퍼블리시해요 — data-api의 botProfileHub가 구독해 대시보드 패널에 서빙해요.
 *
 * Discord 권한 계약 (discord.js v14.27 / Discord API `PATCH /guilds/{id}/members/@me`):
 * - nick: CHANGE_NICKNAME 필요 (자기 닉네임 — MANAGE_NICKNAMES도 허용으로 봐요)
 * - avatar: 권한 불요 (길드 멤버 프로필 이미지 — 이 프로세스에서 검증하지 않아요)
 *
 * - 구독/적용은 실패해도 프로세스를 크래시시키지 않아요 — 상태 퍼블리시에 실패 사유를 담아요.
 * - pending 키는 TTL(120초)이 있어 봇이 모두 무시해도 자동 정리돼요.
 */
import { container } from '@sapphire/framework';
import { BOT_PROFILE_SET_CHANNEL, botProfilePendingKey, ManagedRedisSubscriber } from '@sirubot/utils';
import { Guild, PermissionFlagsBits } from 'discord.js';

/** 봇 프로필 상태 페이로드 — data-api botProfileHub/대시보드 패널과 계약이에요 */
export interface BotProfileState {
	guildId: string;
	/** 현재 길드 닉네임 — null이면 사용자명으로 표시 중이에요 */
	nickname: string | null;
	/** 봇 사용자명 — 닉네임 초기화 시 표시할 기본값이에요 */
	username: string;
	/** 길드 전용 아바타 URL — 설정 안 됐으면 null (패널은 전역 아바타를 보여줘요) */
	guildAvatarUrl: string | null;
	/** 전역(앱) 아바타 URL */
	globalAvatarUrl: string | null;
	/** 닉네임 변경 가능 여부 — CHANGE_NICKNAME 또는 MANAGE_NICKNAMES */
	canChangeNickname: boolean;
	/** 마지막 적용 시도 결과 — 시도가 없으면 null */
	lastApply: { ok: boolean; error: string | null; at: number } | null;
	updatedAt: number;
}

/** 서비스 주입 로거 — guildSettingsInvalidator와 같은 구조예요 */
interface ServiceLogger {
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
	debug(msg: string): void;
}

interface PendingPayload {
	nickname?: string | null;
	avatar?: string | null;
}

export class BotProfileService {
	/** 길드별 마지막 적용 결과 — 멤버 업데이트 리스너가 상태를 다시 퍼블리시할 때도 유지해요 */
	private readonly lastApplies = new Map<string, { ok: boolean; error: string | null; at: number }>();
	private readonly maxLastApplies = 2_000;
	private subscriber: ManagedRedisSubscriber | null = null;

	public constructor(private readonly logger: ServiceLogger) {}

	/** 구독을 시작해요. 실패해도 throw하지 않아요 — 재연결을 시도하고 기능만 비활성돼요. */
	public async start(redisUrl: string | undefined): Promise<void> {
		const url = redisUrl?.trim() || null;
		if (!url) {
			this.logger.warn('REDIS_URL 미설정: 봇 프로필 적용 요청 구독 없이 동작해요 (상태 퍼블리시는 계속돼요)');
			return;
		}
		this.subscriber = new ManagedRedisSubscriber({
			name: '봇 프로필',
			url,
			logger: this.logger,
			bindings: [{ channel: BOT_PROFILE_SET_CHANNEL, onMessage: (raw) => void this.handleSetMessage(raw) }]
		});
		await this.subscriber.start();
	}

	private async handleSetMessage(raw: string): Promise<void> {
		let guildId: string | null = null;
		try {
			const parsed = JSON.parse(raw) as { guildId?: unknown };
			if (typeof parsed?.guildId === 'string' && parsed.guildId.length > 0 && parsed.guildId.length <= 32) {
				guildId = parsed.guildId;
			}
		} catch {
			guildId = null;
		}
		if (!guildId) {
			this.logger.debug(`봇 프로필 페이로드 형식 불일치, 무시: ${raw.slice(0, 100)}`);
			return;
		}

		await this.applyForGuild(guildId).catch((error) => {
			this.logger.error(`봇 프로필 적용 중 예기치 못한 오류 (guild ${guildId}): ${error}`);
		});
	}

	/** 이 프로세스가 길드를 보유하면 pending 키를 읽어 적용하고, 결과를 상태로 퍼블리시해요 */
	private async applyForGuild(guildId: string): Promise<void> {
		const publish = container.redisStore;
		if (!publish) {
			this.logger.warn(`봇 프로필 적용을 위한 redisStore가 없어요 (guild ${guildId})`);
			return;
		}
		const guild = container.client.guilds.cache.get(guildId);
		if (!guild) return; // 다른 레플리카가 보유한 길드 — pending 키는 그쪽이 읽어요

		let rawPending: string | null = null;
		try {
			rawPending = await publish.getCacheValue(botProfilePendingKey(guildId));
			// 읽은 즉시 지워요 — 롤링 재시작으로 두 프로세스가 잠깐 같은 길드를 보유해도 중복 적용을 막아요
			await publish.deleteCacheValue(botProfilePendingKey(guildId));
		} catch (error) {
			this.logger.warn(`봇 프로필 pending 읽기 실패 (guild ${guildId}): ${error}`);
		}

		if (!rawPending) {
			this.logger.debug(`봇 프로필 pending 없음 (guild ${guildId})`);
			return;
		}

		let payload: PendingPayload = {};
		try {
			const parsed = JSON.parse(rawPending) as PendingPayload;
			if (typeof parsed === 'object' && parsed !== null) payload = parsed;
		} catch {
			this.logger.warn(`봇 프로필 pending 페이로드 파싱 실패 (guild ${guildId})`);
			payload = {};
		}

		const hasNickname = 'nickname' in payload;
		const hasAvatar = 'avatar' in payload;
		if (!hasNickname && !hasAvatar) {
			this.logger.debug(`봇 프로필 pending 변경점 없음 (guild ${guildId})`);
			return;
		}

		const startedAt = Date.now();
		const updates: { nick?: string | null; avatar?: string | null } = {};
		if (hasNickname) updates.nick = typeof payload.nickname === 'string' ? payload.nickname : null;
		if (hasAvatar) updates.avatar = typeof payload.avatar === 'string' ? payload.avatar : null;

		try {
			const me = guild.members.me ?? (await guild.members.fetchMe());
			if (hasNickname && !(me.permissions.has(PermissionFlagsBits.ChangeNickname) || me.permissions.has(PermissionFlagsBits.ManageNicknames))) {
				this.recordLastApply(guildId, { ok: false, error: 'missing_permission', at: startedAt });
			} else {
				await guild.members.editMe(updates);
				this.recordLastApply(guildId, { ok: true, error: null, at: startedAt });
				this.logger.info(`봇 프로필 적용 완료: ${guildId} (nickname: ${hasNickname}, avatar: ${hasAvatar})`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.warn(`봇 프로필 Discord 적용 실패 (guild ${guildId}): ${message}`);
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

	/**
	 * 현재 Discord 캐시 기준 봇 프로필 상태를 퍼블리시해요.
	 * READY·길드 추가·봇 멤버 업데이트 리스너와 적용 완료 직후에 호출해요.
	 */
	public publishGuildProfile(guildId: string): void {
		const guild = container.client.guilds.cache.get(guildId);
		if (!guild) return;
		this.publishGuildProfileFromGuild(guild);
	}

	/** 리스너(멤버 업데이트·길드 생성)에서 Guild 객체를 곧장 받아 퍼블리시해요 */
	public publishGuildProfileFromGuild(guild: Guild): void {
		const publish = container.redisStore;
		if (!publish) return;

		try {
			const me = guild.members.me;
			if (!me) {
				// READY 직후 캐시가 아직 차 있지 않을 수 있어요 — 다음 이벤트에서 다시 퍼블리시해요.
				this.logger.debug(`봇 멤버 캐시 미완성, 상태 퍼블리시 스킵 (guild ${guild.id})`);
				return;
			}

			const state: BotProfileState = {
				guildId: guild.id,
				nickname: me.nickname,
				username: me.user?.username ?? container.client.user?.username ?? '',
				guildAvatarUrl: me.avatarURL({ extension: 'png', size: 512 }),
				globalAvatarUrl: me.user?.displayAvatarURL({ extension: 'png', size: 512 }) ?? null,
				canChangeNickname: me.permissions.has(PermissionFlagsBits.ChangeNickname) || me.permissions.has(PermissionFlagsBits.ManageNicknames),
				lastApply: this.lastApplies.get(guild.id) ?? null,
				updatedAt: Date.now()
			};

			publish.publishBotProfileState(guild.id, JSON.stringify(state));
		} catch (error) {
			this.logger.debug(`봇 프로필 상태 퍼블리시 실패 (guild ${guild.id}): ${error}`);
		}
	}

	/** 종료 — 구독 해제 후 연결을 닫아요. shutdown에서 redisStore.disconnect() 전에 불러야 해요. */
	public async stop(): Promise<void> {
		const subscriber = this.subscriber;
		this.subscriber = null;
		await subscriber?.stop();
	}
}
