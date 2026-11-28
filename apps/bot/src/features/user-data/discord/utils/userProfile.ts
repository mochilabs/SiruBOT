import { container } from '@sapphire/framework';
import { isValidBirthday } from '@sirubot/utils/birthday';

export { isValidBirthday };

export function getUserProfile(userId: string) {
	return container.db.user.findUnique({ where: { id: userId } });
}

export async function setUserBirthday(userId: string, month: number, day: number): Promise<boolean> {
	if (!isValidBirthday(month, day)) return false;
	await container.db.user.upsert({
		where: { id: userId },
		create: { id: userId, birthMonth: month, birthDay: day },
		update: { birthMonth: month, birthDay: day }
	});
	return true;
}

export async function clearUserBirthday(userId: string): Promise<boolean> {
	const profile = await getUserProfile(userId);
	if (!profile || profile.birthMonth == null || profile.birthDay == null) return false;
	await container.db.user.update({
		where: { id: userId },
		data: { birthMonth: null, birthDay: null }
	});
	return true;
}

export function isValidIntro(intro: string): boolean {
	const trimmed = intro.trim();
	return trimmed.length >= 1 && trimmed.length <= 120;
}

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

export async function clearUserIntro(userId: string): Promise<boolean> {
	const profile = await getUserProfile(userId);
	if (!profile?.intro) return false;
	await container.db.user.update({ where: { id: userId }, data: { intro: null } });
	return true;
}
