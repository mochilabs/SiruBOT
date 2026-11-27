import { z } from 'zod';

export const BIRTHDAY_DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function isValidBirthday(month: number, day: number): boolean {
	if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
	if (month < 1 || month > 12) return false;
	return day >= 1 && day <= BIRTHDAY_DAYS_IN_MONTH[month - 1]!;
}

export const birthdayInputSchema = z
	.object({
		month: z.number().int().min(1).max(12),
		day: z.number().int().min(1).max(31)
	})
	.refine(({ month, day }) => isValidBirthday(month, day), { message: '존재하지 않는 날짜예요.', path: ['day'] });

export type BirthdayInput = z.infer<typeof birthdayInputSchema>;
