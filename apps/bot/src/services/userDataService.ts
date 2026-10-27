import { container } from '@sapphire/framework';
import { Prisma } from '@sirubot/prisma';
import type { MemoryCategory } from '@sirubot/utils';
import { MEMORY_CATEGORIES, parseMemoryMarkdown } from '@sirubot/utils';

/**
 * 사용자 단위 데이터 열람·삭제 — `/개인정보`가 쓰는 유일한 경로예요.
 *
 * 삭제 범위는 **개인 단위 저장소**만이에요. 채널 대화 기록(`ChannelChatHistory`)과
 * 길드 설정은 여러 사용자가 공유하므로 여기서 지우지 않아요(서버 관리자 권한 경로로만).
 */

export interface UserDataSummary {
	/** AI 장기 기억 항목 수 (MEMORY.md의 Facts/Preferences/Commitments 합계) */
	memoryFacts: number;
	/** AI 단기 기억(최근 대화 하이라이트) 수 */
	shortTermTurns: number;
	hasBirthday: boolean;
	hasIntro: boolean;
	/** 채팅 TTS 사용자 설정 행 수 (길드별) */
	ttsSettings: number;
	/** 게임 전적 행 수 */
	gameRecords: number;
}

export interface PurgeResult {
	memoryRows: number;
	shortTermCleared: boolean;
	profileRows: number;
	ttsRows: number;
	gameRecords: number;
}

/** 열람 — 저장된 것들을 종류별 개수로만 보여줘요(내용 자체는 노출하지 않아요) */
export async function summarizeUserData(userId: string): Promise<UserDataSummary> {
	const [memory, profile, ttsSettings, gameRecords] = await Promise.all([
		container.db.userMemory.findUnique({ where: { userId }, select: { longTerm: true, shortTerm: true } }),
		container.db.user.findUnique({ where: { id: userId }, select: { birthMonth: true, birthDay: true, intro: true } }),
		container.db.ttsUserSetting.count({ where: { userId } }),
		container.db.gameRecord.count({ where: { userId } })
	]);

	const sections = parseMemoryMarkdown(typeof memory?.longTerm === 'string' ? memory.longTerm : '', { strictSections: false });
	const memoryFacts = MEMORY_CATEGORIES.reduce((sum, category: MemoryCategory) => sum + sections[category].length, 0);
	const shortTermTurns = Array.isArray(memory?.shortTerm) ? memory.shortTerm.length : 0;

	return {
		memoryFacts,
		shortTermTurns,
		hasBirthday: profile?.birthMonth != null && profile?.birthDay != null,
		hasIntro: Boolean(profile?.intro),
		ttsSettings,
		gameRecords
	};
}

/** 삭제 — 트랜잭션 없이 순차 실행해요(부분 실패해도 사용자에게 삭제된 개수를 정직하게 알려요) */
export async function purgeUserData(userId: string): Promise<PurgeResult> {
	const memory = await container.db.userMemory.findUnique({ where: { userId }, select: { userId: true, shortTerm: true } });

	let memoryRows = 0;
	let shortTermCleared = false;
	if (memory) {
		// 단기 기억은 행을 지우는 대신 비워요 — 장기 기억 파일이 같은 행에 있어요
		shortTermCleared = Array.isArray(memory.shortTerm) && memory.shortTerm.length > 0;
		// Prisma Json 컬럼은 JS null 대신 DbNull을 써야 실제 NULL이 돼요
		await container.db.userMemory.update({ where: { userId }, data: { longTerm: Prisma.DbNull, shortTerm: [] } });
		memoryRows = 1;
	}

	const profileUpdate = await container.db.user.updateMany({
		where: { id: userId },
		data: { birthMonth: null, birthDay: null, intro: null }
	});

	const tts = await container.db.ttsUserSetting.deleteMany({ where: { userId } });
	const games = await container.db.gameRecord.deleteMany({ where: { userId } });

	return {
		memoryRows,
		shortTermCleared,
		profileRows: profileUpdate.count,
		ttsRows: tts.count,
		gameRecords: games.count
	};
}
