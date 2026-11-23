/**
 * 날짜·시각 문자열 헬퍼 — 시간대 없이 "벽시계" 값만 다뤄요.
 * 날짜+시각은 "YYYY-MM-DDTHH:mm"(예약 메시지·나눔이 보내는 한국 시간), 날짜는 "YYYY-MM-DD", 시각은 "HH:mm"이에요.
 * 달력 계산은 전부 UTC 기준 순수 연산이라 브라우저 시간대·서머타임의 영향을 받지 않아요.
 */

export interface DateParts {
	year: number;
	/** 1~12 */
	month: number;
	/** 1~31 */
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

/** 0(일)~6(토) */
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

/** 화면에 보이는 표기 — "2026. 11. 25. (수) 21:00" */
export function displayDateTime(value: string): string | null {
	const parts = parseDateTime(value);
	if (!parts) return null;
	return `${parts.year}. ${parts.month}. ${parts.day}. (${WEEKDAY_LABELS[weekdayOf(parts)]}) ${formatTime(parts.hour, parts.minute)}`;
}

/** 날짜를 일 단위로 옮겨요 (월·연 경계 포함) */
export function addDays(date: DateParts, delta: number): DateParts {
	const next = new Date(Date.UTC(date.year, date.month - 1, date.day + delta));
	return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

/** 월을 옮겨요 — 도착 달에 없는 날짜(31일 등)는 그 달 말일로 맞춰요 */
export function addMonths(date: DateParts, delta: number): DateParts {
	const total = date.year * 12 + (date.month - 1) + delta;
	const year = Math.floor(total / 12);
	const month = (total % 12 + 12) % 12 + 1;
	return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

export function compareDates(a: DateParts, b: DateParts): number {
	return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** 일요일 시작 6주(42칸)짜리 달력 칸 — 앞뒤 달 날짜로 빈칸을 채워요 */
export function monthGrid(year: number, month: number): { date: DateParts; inMonth: boolean }[] {
	const first = { year, month, day: 1 };
	const start = addDays(first, -weekdayOf(first));
	return Array.from({ length: 42 }, (_, index) => {
		const date = addDays(start, index);
		return { date, inMonth: date.year === year && date.month === month };
	});
}

/** 지금 한국 시간의 벽시계 값 ("YYYY-MM-DDTHH:mm") — minutesFromNow만큼 더해서 돌려줘요 */
export function kstNow(minutesFromNow = 0, now: Date = new Date()): string {
	const shifted = new Date(now.getTime() + 9 * 60 * 60_000 + minutesFromNow * 60_000);
	return shifted.toISOString().slice(0, 16);
}

/** 두 "YYYY-MM-DDTHH:mm" 값 비교 (문자열 사전식 비교가 곧 시간순이에요) */
export function clampDateTime(value: string, min?: string, max?: string): string {
	if (min && value < min) return min;
	if (max && value > max) return max;
	return value;
}
