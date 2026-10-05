import { PrismaClient } from '@sirubot/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { getLogger } from '../utils/logger.ts';

const logger = getLogger('db');

let db: PrismaClient | null = null;

/** DATABASE_URL이 있을 때만 Prisma를 연결해요 (없으면 메모리 정리 잡이 비활성화돼요). */
export async function connectDb(connectionString: string | undefined): Promise<PrismaClient | null> {
	if (!connectionString) {
		logger.warn('DATABASE_URL is not set, memory tidy will be disabled');
		return null;
	}
	try {
		db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
		await db.$connect();
		logger.info('Connected to PostgreSQL');
		return db;
	} catch (error) {
		logger.error('DB connect failed, memory tidy will be disabled:', String(error));
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
