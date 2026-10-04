import { container } from '@sapphire/framework';

/** 월별 최대 일수 — 2/29(윤년 생일) 허용 */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** 생일(월/일) 유효성. 연도는 저장하지 않아요. */
export function isValidBirthday(month: number, day: number): boolean {
	if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
	if (month < 1 || month > 12) return false;
	return day >= 1 && day <= DAYS_IN_MONTH[month - 1]!;
}

/** 프로필 행 조회. 없으면 null (행은 생일 저장 시 만들어져요) */
export function getUserProfile(userId: string) {
	return container.db.user.findUnique({ where: { id: userId } });
}

/** 생일 저장. 유효하지 않은 날짜면 false */
export async function setUserBirthday(userId: string, month: number, day: number): Promise<boolean> {
	if (!isValidBirthday(month, day)) return false;
	await container.db.user.upsert({
		where: { id: userId },
		create: { id: userId, birthMonth: month, birthDay: day },
		update: { birthMonth: month, birthDay: day }
	});
	return true;
}

/** 생일 삭제. 등록된 생일이 있었으면 true */
export async function clearUserBirthday(userId: string): Promise<boolean> {
	const profile = await getUserProfile(userId);
	if (!profile || profile.birthMonth == null || profile.birthDay == null) return false;
	await container.db.user.update({
		where: { id: userId },
		data: { birthMonth: null, birthDay: null }
	});
	return true;
}
