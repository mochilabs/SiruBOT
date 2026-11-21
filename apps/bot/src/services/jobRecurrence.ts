/**
 * 반복 작업의 다음 실행 시각 계산 — 순수 함수예요 (Asia/Seoul 고정, 서버별 시간대는 아직 없어요).
 * 반복은 핸들러가 끝날 때 `nextRunAt()`으로 다음 행을 `schedule()`하는 방식이에요.
 * 한국은 서머타임이 없어서 KST = UTC+9 고정 오프셋으로 계산해요.
 */

const KST_OFFSET_MS = 9 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export type Recurrence =
	| { type: 'daily'; time: string }
	/** weekday: 0=일요일 … 6=토요일 (Date#getDay와 같아요) */
	| { type: 'weekly'; weekday: number; time: string }
	/** day: 1~31. 그 달에 없는 날이면 그 달의 마지막 날로 당겨요 */
	| { type: 'monthly'; day: number; time: string };

/** "HH:mm"(24시간)을 시·분으로 풀어요. 형식이 틀리면 RangeError */
export function parseTimeOfDay(time: string): { hour: number; minute: number } {
	const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
	if (!match) throw new RangeError(`시각 형식이 올바르지 않아요: ${time}`);
	return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** KST 달력의 (년, 월, 일) + 시각을 UTC 시각(Date)으로 바꿔요. 월·일이 넘치면 Date.UTC가 이월해요 */
function kstToDate(year: number, month: number, day: number, hour: number, minute: number): Date {
	return new Date(Date.UTC(year, month, day, hour, minute) - KST_OFFSET_MS);
}

function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** `after` 시각 "이후"(같은 순간은 제외)에 처음 오는 실행 시각을 돌려줘요 */
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
			// Date.UTC가 12월 다음 달을 다음 해 1월로 이월해요
			const nextYearMonth = new Date(Date.UTC(year, month + 1, 1));
			const ny = nextYearMonth.getUTCFullYear();
			const nm = nextYearMonth.getUTCMonth();
			return kstToDate(ny, nm, Math.min(rule.day, daysInMonth(ny, nm)), hour, minute);
		}
	}
}
