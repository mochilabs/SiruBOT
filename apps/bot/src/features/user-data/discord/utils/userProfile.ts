import { container } from '@sapphire/framework';
import { isValidBirthday } from '@sirubot/utils/birthday';

// 생일 유효성 규칙은 대시보드와 함께 쓰려고 @sirubot/utils/birthday에 있어요
export { isValidBirthday };

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

/** 소개 문구 유효성 — 1~120자 */
export function isValidIntro(intro: string): boolean {
	const trimmed = intro.trim();
	return trimmed.length >= 1 && trimmed.length <= 120;
}

/** 소개 저장. 유효하지 않으면 false */
export async function setUserIntro(userId: string, intro: string): Promise<boolean> {
	const trimmed = intro.trim();
	if (!isValidIntro(trimmed)) return false;
	await container.db.user.upsert({
		where: { id: userId },
		create: { id: userId, intro: trimmed },
		update: { intro: trimmed }
	});
	return true;
}

/** 소개 삭제. 등록된 소개가 있었으면 true */
export async function clearUserIntro(userId: string): Promise<boolean> {
	const profile = await getUserProfile(userId);
	if (!profile?.intro) return false;
	await container.db.user.update({ where: { id: userId }, data: { intro: null } });
	return true;
}
