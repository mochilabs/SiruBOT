/**
 * 생일 계약 — 프로필 생일(월/일) 유효성의 단일 홈.
 *
 * 저장은 `User.birthMonth`/`User.birthDay` 두 칼럼이고 연도는 저장하지 않아요.
 * 봇 `/프로필 생일설정`과 대시보드 프로필 생일 API가 같은 규칙으로 검증해요.
 */
import { z } from 'zod';

/** 월별 최대 일수 — 연도가 없어서 2/29(윤년 생일)를 허용해요 */
export const BIRTHDAY_DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** 생일(월/일) 유효성 */
export function isValidBirthday(month: number, day: number): boolean {
	if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
	if (month < 1 || month > 12) return false;
	return day >= 1 && day <= BIRTHDAY_DAYS_IN_MONTH[month - 1]!;
}

/** 생일 저장 요청 본문 — 범위 검사 후 월별 일수까지 확인해요 */
export const birthdayInputSchema = z
	.object({
		month: z.number().int().min(1).max(12),
		day: z.number().int().min(1).max(31)
	})
	.refine(({ month, day }) => isValidBirthday(month, day), { message: '존재하지 않는 날짜예요.', path: ['day'] });

export type BirthdayInput = z.infer<typeof birthdayInputSchema>;
