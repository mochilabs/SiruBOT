import type { PrismaClient } from '@sirubot/prisma';

export const FRESH_JOIN_WINDOW_MS = 10 * 60_000;

export type JoinKind = 'first' | 'rejoin' | 'skip';

export interface GuildLifecycleDeps {
	db: Pick<PrismaClient, 'guildLifecycle'>;
}

export interface GuildLifecycleService {
	recordJoin(guildId: string, botJoinedAt: Date | null, now?: Date): Promise<JoinKind>;
	markOnboarded(guildId: string, at?: Date): Promise<void>;
	recordLeave(guildId: string, at?: Date): Promise<void>;
	markFirstUse(guildIds: readonly string[], at: Date): Promise<void>;
}

export function isFreshJoin(botJoinedAt: Date | null, now: Date): boolean {
	return botJoinedAt === null || now.getTime() - botJoinedAt.getTime() <= FRESH_JOIN_WINDOW_MS;
}

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
			// 배포 전부터 있던 서버는 행이 없어 upsert로 나간 기록을 만들어 둬요.
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
