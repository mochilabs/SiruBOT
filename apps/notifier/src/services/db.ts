import { PrismaClient } from '@sirubot/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('db');

let db: PrismaClient | null = null;

/** DATABASE_URL이 있을 때만 Prisma를 연결해요 (없으면 소셜 알림 워커가 비활성화돼요). */
export async function connectDb(connectionString: string | undefined): Promise<PrismaClient | null> {
	if (!connectionString) {
		logger.warn('DATABASE_URL이 없어요 — 소셜 알림 워커를 비활성화해요.');
		return null;
	}
	try {
		db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
		await db.$connect();
		logger.info('PostgreSQL에 연결했어요.');
		return db;
	} catch (error) {
		logger.error('DB 연결 실패 — 소셜 알림 워커를 비활성화해요:', String(error));
		db = null;
		return null;
	}
}

export async function disconnectDb(): Promise<void> {
	if (db) {
		await db.$disconnect().catch(() => null);
		db = null;
	}
}

export function getDb(): PrismaClient | null {
	return db;
}
