const KST_OFFSET_MS = 9 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export type Recurrence =
	{ type: 'daily'; time: string } | { type: 'weekly'; weekday: number; time: string } | { type: 'monthly'; day: number; time: string };

export function parseTimeOfDay(time: string): { hour: number; minute: number } {
	const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
	if (!match) throw new RangeError(`시각 형식이 올바르지 않아요: ${time}`);
	return { hour: Number(match[1]), minute: Number(match[2]) };
}

function kstToDate(year: number, month: number, day: number, hour: number, minute: number): Date {
	return new Date(Date.UTC(year, month, day, hour, minute) - KST_OFFSET_MS);
}

function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function nextRunAt(rule: Recurrence, after: Date): Date {
	const { hour, minute } = parseTimeOfDay(rule.time);
	const kst = new Date(after.getTime() + KST_OFFSET_MS);
	const year = kst.getUTCFullYear();
	const month = kst.getUTCMonth();
	const day = kst.getUTCDate();

	switch (rule.type) {
		case 'daily': {
			const today = kstToDate(year, month, day, hour, minute);
			return today.getTime() > after.getTime() ? today : new Date(today.getTime() + DAY_MS);
		}
		case 'weekly': {
			if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) {
				throw new RangeError(`요일은 0(일)~6(토)이어야 해요: ${rule.weekday}`);
			}
			const today = kstToDate(year, month, day, hour, minute);
			let ahead = (rule.weekday - kst.getUTCDay() + 7) % 7;
			if (ahead === 0 && today.getTime() <= after.getTime()) ahead = 7;
			return new Date(today.getTime() + ahead * DAY_MS);
		}
		case 'monthly': {
			if (!Number.isInteger(rule.day) || rule.day < 1 || rule.day > 31) {
				throw new RangeError(`날짜는 1~31이어야 해요: ${rule.day}`);
			}
			const thisMonth = kstToDate(year, month, Math.min(rule.day, daysInMonth(year, month)), hour, minute);
			if (thisMonth.getTime() > after.getTime()) return thisMonth;
			const nextYearMonth = new Date(Date.UTC(year, month + 1, 1));
			const ny = nextYearMonth.getUTCFullYear();
			const nm = nextYearMonth.getUTCMonth();
			return kstToDate(ny, nm, Math.min(rule.day, daysInMonth(ny, nm)), hour, minute);
		}
	}
}
