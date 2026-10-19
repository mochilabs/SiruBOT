/**
 * 길드 데이터(채널·역할·멤버 목록) 응답자 — 대시보드 조회 → data-api Redis 요청 → 봇 캐시 매핑 → Redis 응답.
 *
 * 대시보드가 사용자 토큰으로 Discord API를 직접 호출하면 401이 나므로 봇 권한으로 우회해요.
 * data-api가 Redis 채널(`sirubot:guild-data:request`)로 {requestId, guildId, kind, userIds?}를
 * 브로드캐스트하면, 그 길드를 보유한 봇 프로세스만 이 서비스가 guild.channels.cache/
 * guild.roles.cache/guild.members.cache를 매핑해 `sirubot:guild-data:response` 채널로 응답해요 —
 * data-api guildDataHub가 requestId로 응답을 상관(correlation)해 대시보드에 내려줘요.
 *
 * - 구독은 RedisStore 공용 연결을 못 쓰므로(구독 모드는 일반 명령 불가) 전용 연결을 만들어요.
 * - 이 프로세스가 보유하지 않은 길드면 조용히 무시해요 — 다른 레플리카가 응답해요.
 *   아무도 응답하지 않으면 data-api가 타임아웃으로 처리해요.
 * - 어떤 경우에도 절대 throw하지 않아요 — 처리 실패는 대시보드의 타임아웃 폴백으로 이어져요.
 */
import { container } from '@sapphire/framework';
import { GUILD_DATA_REQUEST_CHANNEL, ManagedRedisSubscriber, guildDataRequestSchema } from '@sirubot/utils';
import { unwrapRedisMessage, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import type { GuildChannelItem, GuildDataRequest, GuildDataResponse, GuildMemberItem, GuildRoleItem } from '@sirubot/utils';
import type { Guild, GuildMember } from 'discord.js';

/** 페이로드 검증 — {"requestId":"<uuid>","guildId":"<길드 ID>","kind":"channels"|"roles"|"members"} 형태만 응답해요 */
function parseGuildDataRequest(raw: string): GuildDataRequest | null {
	try {
		const parsed = guildDataRequestSchema.safeParse(JSON.parse(raw));
		if (parsed.success) return parsed.data;
	} catch {
		// 형식 불일치 — 조용히 무시 (로그는 호출부에서 남겨요)
	}
	return null;
}

/** mapGuildMemberToItem이 필요로 하는 최소 구조 — GuildMember 대신 구조 타입을 쓰면 유닛 테스트가 가벼워져요 */
interface MemberLike {
	id: string;
	nickname: string | null;
	user: { username: string; globalName: string | null };
	displayAvatarURL(options?: { size?: number }): string;
}

/** 멤버 표시 정보 매핑 — 서버 별명이 최우선, 그다음 전역 표시 이름, 마지막으로 계정 사용자명이에요 */
export function mapGuildMemberToItem(member: MemberLike): GuildMemberItem {
	return {
		id: member.id,
		displayName: member.nickname ?? member.user.globalName ?? member.user.username,
		username: member.user.username,
		avatarUrl: member.displayAvatarURL({ size: 64 })
	};
}

export class GuildDataResponder {
	private subscriber: ManagedRedisSubscriber | null = null;

	public constructor(
		private readonly logger: { info(msg: string): void; warn(msg: string): void; error(msg: string): void; debug(msg: string): void },
		// Redis 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY. 비어 있으면 서명 없는 구버전 모드(개발용).
		private readonly signingKey: string = ''
	) {}

	/**
	 * 구독을 시작해요. 실패해도 throw하지 않아요 — 대시보드 패널 조회만 실패로 끝나고,
	 * 전용 구독 관리자가 자체 백오프(5s→60s)로 재연결을 시도해요.
	 */
	public async start(redisUrl: string | undefined): Promise<void> {
		const url = redisUrl?.trim() || null;
		if (!url) {
			this.logger.warn(
				'REDIS_URL 미설정: 길드 데이터 요청 구독 없이 동작해요. 대시보드 연동(채널/역할 조회, 웹 플레이어, JTC 셋업, 인사, 봇 프로필)은 전부 응답 불가 상태예요.'
			);
			return;
		}
		// start 자체는 실패를 던지지 않는다 — connect만 여기서 시도하고 나머지는 비동기 재시도.
		this.subscriber = new ManagedRedisSubscriber({
			name: '길드 데이터',
			url,
			logger: this.logger,
			bindings: [
				{
					channel: GUILD_DATA_REQUEST_CHANNEL,
					// 서명 검증을 통과한 본문만 처리해요 (SEC-006).
					onMessage: (raw) => {
						const body = unwrapRedisMessage(this.signingKey, raw);
						if (body === null) {
							this.logger.warn('길드 데이터 요청 거부: 서명 검증 실패');
							return;
						}
						this.handleRequest(body);
					}
				}
			]
		});
		await this.subscriber.start();
	}

	private handleRequest(raw: string): void {
		const request = parseGuildDataRequest(raw);
		if (!request) {
			this.logger.debug(`길드 데이터 요청 페이로드 형식 불일치, 무시: ${raw.slice(0, 100)}`);
			return;
		}
		try {
			const guild = container.client.guilds.cache.get(request.guildId);
			if (!guild) return; // 다른 레플리카가 보유한 길드 — 그쪽이 응답해요 (아무도 없으면 data-api 타임아웃)

			if (request.kind === 'channels') {
				// 쓰레드 포함 전부 매핑해요 — 대시보드가 type으로 필터링해요.
				const channels: GuildChannelItem[] = [...guild.channels.cache.values()].map((channel) => ({
					id: channel.id,
					name: channel.name,
					type: channel.type,
					parentId: channel.parentId,
					position: 'position' in channel ? channel.position : 0
				}));
				this.respond({ requestId: request.requestId, guildId: request.guildId, kind: request.kind, channels });
				return;
			}

			if (request.kind === 'members') {
				// 멤버 조회는 캐시 미스 시 fetch가 필요한 비동기 작업이에요 — 구독 onMessage(동기)를 막지 않게 분리해요.
				void this.handleMembersRequest(guild, request);
				return;
			}

			const roles: GuildRoleItem[] = [...guild.roles.cache.values()].map((role) => ({
				id: role.id,
				name: role.name,
				color: role.color,
				position: role.position,
				managed: role.managed
			}));
			this.respond({ requestId: request.requestId, guildId: request.guildId, kind: request.kind, roles });
		} catch (error) {
			this.logger.warn(`길드 데이터 응답 작성 실패, 대시보드 타임아웃 폴백 (guild ${request.guildId}, kind ${request.kind}): ${error}`);
		}
	}

	/**
	 * 멤버 표시 정보를 병렬로 조회해 응답해요 — 대시보드 통계 topRequesters의 아바타/별명 표시에 쓰여요.
	 * 캐시에 없는 멤버는 개별 fetch하고, 이미 길드를 떠난 멤버는 조용히 건너뛰어요.
	 */
	private async handleMembersRequest(guild: Guild, request: GuildDataRequest): Promise<void> {
		try {
			const settled = await Promise.allSettled(
				(request.userIds ?? []).map(async (userId) => {
					const cached = guild.members.cache.get(userId);
					if (cached) return cached;
					return guild.members.fetch(userId);
				})
			);
			const members: GuildMemberItem[] = settled
				.filter((result): result is PromiseFulfilledResult<GuildMember> => result.status === 'fulfilled')
				.map((result) => mapGuildMemberToItem(result.value));
			this.respond({ requestId: request.requestId, guildId: request.guildId, kind: request.kind, members });
		} catch (error) {
			this.logger.warn(`멤버 목록 응답 실패, 대시보드 ID 폴백 (guild ${request.guildId}): ${error}`);
		}
	}

	/** 요청한 kind에 맞는 배열을 응답 채널로 퍼블리시해요 (redisStore 없으면 로그만 남겨요) */
	private respond(response: GuildDataResponse): void {
		const store = container.redisStore;
		if (!store) {
			this.logger.warn(`길드 데이터 응답을 위한 redisStore가 없어요 (guild ${response.guildId})`);
			return;
		}
		store.publishGuildDataResponse(wrapRedisMessage(this.signingKey, response));
		this.logger.debug(`길드 데이터 응답 퍼블리시 (guild ${response.guildId}, kind ${response.kind})`);
	}

	/** 종료 — 구독 해제 후 연결을 닫아요. 호출자(shutdown)는 redisStore.disconnect() 전에 불러야 해요. */
	public async stop(): Promise<void> {
		const subscriber = this.subscriber;
		this.subscriber = null;
		await subscriber?.stop();
	}
}
