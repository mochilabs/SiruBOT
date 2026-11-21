/**
 * 서버 생명주기 (GuildLifecycle) — 봇이 들어오고 나간 기록, 안내 발송, 첫 사용 시각.
 * 온보딩(guildCreate)과 사용 지표(첫 사용)가 써요. Guild 설정 행과 따로라 나간 뒤에도 남아요.
 *
 * 같은 이벤트가 두 번 와도(샤드 재연결 등) 안내가 한 번만 나가게, 판단은 조건부 쓰기 결과로 해요.
 */
import type { PrismaClient } from '@sirubot/prisma';

/** 봇의 서버 가입 시각이 이보다 오래됐으면 새로 들어온 게 아니에요 (캐시 재구성으로 온 이벤트) */
export const FRESH_JOIN_WINDOW_MS = 10 * 60_000;

/** `first`: 처음 들어옴 · `rejoin`: 나갔다가 다시 들어옴 · `skip`: 안내하지 않음 */
export type JoinKind = 'first' | 'rejoin' | 'skip';

export interface GuildLifecycleDeps {
	db: Pick<PrismaClient, 'guildLifecycle'>;
}

export interface GuildLifecycleService {
	/** 들어온 기록을 남기고 어떤 안내를 보낼지 돌려줘요. `botJoinedAt`은 봇 멤버의 가입 시각(`guild.joinedAt`)이에요. */
	recordJoin(guildId: string, botJoinedAt: Date | null, now?: Date): Promise<JoinKind>;
	markOnboarded(guildId: string, at?: Date): Promise<void>;
	recordLeave(guildId: string, at?: Date): Promise<void>;
	/** 아직 첫 사용 시각이 없는 서버에만 기록해요 */
	markFirstUse(guildIds: readonly string[], at: Date): Promise<void>;
}

export function isFreshJoin(botJoinedAt: Date | null, now: Date): boolean {
	return botJoinedAt === null || now.getTime() - botJoinedAt.getTime() <= FRESH_JOIN_WINDOW_MS;
}

/** Prisma 고유 키 충돌 (PrismaClientKnownRequestError P2002) */
const isUniqueViolation = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';

export function createGuildLifecycleService(deps: GuildLifecycleDeps): GuildLifecycleService {
	const { db } = deps;
	return {
		async recordJoin(guildId, botJoinedAt, now = new Date()) {
			const fresh = isFreshJoin(botJoinedAt, now);
			try {
				await db.guildLifecycle.create({ data: { guildId, joinedAt: now, joinCount: 1 } });
				return fresh ? 'first' : 'skip';
			} catch (error) {
				if (!isUniqueViolation(error)) throw error;
			}
			// 행이 있어요: 나간 기록이 있을 때만 다시 들어온 거예요. 조건부 갱신이라 두 번 와도 한 번만 성공해요.
			const reopened = await db.guildLifecycle.updateMany({
				where: { guildId, leftAt: { not: null } },
				data: { joinedAt: now, leftAt: null, joinCount: { increment: 1 } }
			});
			return reopened.count === 1 && fresh ? 'rejoin' : 'skip';
		},

		async markOnboarded(guildId, at = new Date()) {
			await db.guildLifecycle.updateMany({ where: { guildId }, data: { onboardedAt: at } });
		},

		async recordLeave(guildId, at = new Date()) {
			// 배포 전부터 있던 서버는 행이 없어요. 나간 기록을 만들어 두면 다시 들어올 때 짧은 안내가 가요.
			await db.guildLifecycle.upsert({
				where: { guildId },
				create: { guildId, joinedAt: at, leftAt: at, joinCount: 1 },
				update: { leftAt: at }
			});
		},

		async markFirstUse(guildIds, at) {
			if (guildIds.length === 0) return;
			await db.guildLifecycle.updateMany({ where: { guildId: { in: [...guildIds] }, firstUseAt: null }, data: { firstUseAt: at } });
		}
	};
}
