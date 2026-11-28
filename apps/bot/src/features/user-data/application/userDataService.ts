import { Prisma, type PrismaClient } from '@sirubot/prisma';
import type { MemoryCategory } from '@sirubot/utils';
import { MEMORY_CATEGORIES, parseMemoryMarkdown } from '@sirubot/utils';

export interface UserDataSummary {
	memoryFacts: number;
	shortTermTurns: number;
	hasShortTermSummary: boolean;
	hasBirthday: boolean;
	hasIntro: boolean;
	ttsSettings: number;
	gameRecords: number;
	birthdayOptIns: number;
	giveawayEntries: number;
}

export interface PurgeResult {
	memoryRows: number;
	shortTermCleared: boolean;
	profileRows: number;
	ttsRows: number;
	gameRecords: number;
	birthdayOptIns: number;
	giveawayEntries: number;
}

export async function summarizeUserData(db: PrismaClient, userId: string): Promise<UserDataSummary> {
	const [memory, profile, ttsSettings, gameRecords, birthdayOptIns, giveawayEntries] = await Promise.all([
		db.userMemory.findUnique({ where: { userId }, select: { longTerm: true, shortTerm: true, shortTermSummary: true } }),
		db.user.findUnique({ where: { id: userId }, select: { birthMonth: true, birthDay: true, intro: true } }),
		db.ttsUserSetting.count({ where: { userId } }),
		db.gameRecord.count({ where: { userId } }),
		db.birthdayOptIn.count({ where: { userId } }),
		db.giveawayEntry.count({ where: { userId } })
	]);

	const sections = parseMemoryMarkdown(typeof memory?.longTerm === 'string' ? memory.longTerm : '', { strictSections: false });
	const memoryFacts = MEMORY_CATEGORIES.reduce((sum, category: MemoryCategory) => sum + sections[category].length, 0);
	const shortTermTurns = Array.isArray(memory?.shortTerm) ? memory.shortTerm.length : 0;

	return {
		memoryFacts,
		shortTermTurns,
		hasShortTermSummary: Boolean(memory?.shortTermSummary),
		hasBirthday: profile?.birthMonth != null && profile?.birthDay != null,
		hasIntro: Boolean(profile?.intro),
		ttsSettings,
		gameRecords,
		birthdayOptIns,
		giveawayEntries
	};
}

export async function purgeUserData(db: PrismaClient, userId: string): Promise<PurgeResult> {
	const memory = await db.userMemory.findUnique({ where: { userId }, select: { userId: true, shortTerm: true, shortTermSummary: true } });

	let memoryRows = 0;
	let shortTermCleared = false;
	if (memory) {
		shortTermCleared = (Array.isArray(memory.shortTerm) && memory.shortTerm.length > 0) || Boolean(memory.shortTermSummary);
		// Prisma Json 컬럼은 JS null 대신 DbNull을 써야 실제 NULL이 돼요
		await db.userMemory.update({ where: { userId }, data: { longTerm: Prisma.DbNull, shortTerm: [], shortTermSummary: null } });
		memoryRows = 1;
	}

	const profileUpdate = await db.user.updateMany({
		where: { id: userId },
		data: { birthMonth: null, birthDay: null, intro: null }
	});

	const tts = await db.ttsUserSetting.deleteMany({ where: { userId } });
	const games = await db.gameRecord.deleteMany({ where: { userId } });
	const birthdayOptIns = await db.birthdayOptIn.deleteMany({ where: { userId } });
	const giveaways = await db.giveawayEntry.deleteMany({ where: { userId } });

	return {
		memoryRows,
		shortTermCleared,
		profileRows: profileUpdate.count,
		ttsRows: tts.count,
		gameRecords: games.count,
		birthdayOptIns: birthdayOptIns.count,
		giveawayEntries: giveaways.count
	};
}
