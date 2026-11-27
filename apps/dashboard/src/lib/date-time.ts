export interface DateParts {
	year: number;
	month: number;
	day: number;
}

export interface DateTimeParts extends DateParts {
	hour: number;
	minute: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/;

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

export function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function weekdayOf({ year, month, day }: DateParts): number {
	return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isValidDate({ year, month, day }: DateParts): boolean {
	return year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function parseDate(value: string): DateParts | null {
	const match = DATE_RE.exec(value);
	if (!match) return null;
	const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
	return isValidDate(parts) ? parts : null;
}

export function parseTime(value: string): { hour: number; minute: number } | null {
	const match = TIME_RE.exec(value);
	if (!match) return null;
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

export function parseDateTime(value: string): DateTimeParts | null {
	const match = DATE_TIME_RE.exec(value);
	if (!match) return null;
	const parts = {
		year: Number(match[1]),
		month: Number(match[2]),
		day: Number(match[3]),
		hour: Number(match[4]),
		minute: Number(match[5]),
	};
	return isValidDate(parts) && parts.hour <= 23 && parts.minute <= 59 ? parts : null;
}

export function formatDate({ year, month, day }: DateParts): string {
	return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function formatTime(hour: number, minute: number): string {
	return `${pad(hour)}:${pad(minute)}`;
}

export function formatDateTime(parts: DateTimeParts): string {
	return `${formatDate(parts)}T${formatTime(parts.hour, parts.minute)}`;
}

export function displayDateTime(value: string): string | null {
	const parts = parseDateTime(value);
	if (!parts) return null;
	return `${parts.year}. ${parts.month}. ${parts.day}. (${WEEKDAY_LABELS[weekdayOf(parts)]}) ${formatTime(parts.hour, parts.minute)}`;
}

export function addDays(date: DateParts, delta: number): DateParts {
	const next = new Date(Date.UTC(date.year, date.month - 1, date.day + delta));
	return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

export function addMonths(date: DateParts, delta: number): DateParts {
	const total = date.year * 12 + (date.month - 1) + delta;
	const year = Math.floor(total / 12);
	const month = (total % 12 + 12) % 12 + 1;
	return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

export function compareDates(a: DateParts, b: DateParts): number {
	return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function monthGrid(year: number, month: number): { date: DateParts; inMonth: boolean }[] {
	const first = { year, month, day: 1 };
	const start = addDays(first, -weekdayOf(first));
	return Array.from({ length: 42 }, (_, index) => {
		const date = addDays(start, index);
		return { date, inMonth: date.year === year && date.month === month };
	});
}

export function kstNow(minutesFromNow = 0, now: Date = new Date()): string {
	const shifted = new Date(now.getTime() + 9 * 60 * 60_000 + minutesFromNow * 60_000);
	return shifted.toISOString().slice(0, 16);
}

export function clampDateTime(value: string, min?: string, max?: string): string {
	if (min && value < min) return min;
	if (max && value > max) return max;
	return value;
}
