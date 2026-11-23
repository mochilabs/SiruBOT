import { describe, expect, it } from "vitest";

import {
	addDays,
	addMonths,
	clampDateTime,
	daysInMonth,
	displayDateTime,
	formatDateTime,
	kstNow,
	monthGrid,
	parseDate,
	parseDateTime,
	parseTime,
	weekdayOf,
} from "./date-time";

describe("parse", () => {
	it("올바른 값만 읽어요", () => {
		expect(parseDateTime("2026-11-25T21:05")).toEqual({ year: 2026, month: 11, day: 25, hour: 21, minute: 5 });
		expect(parseDateTime("2026-11-25 21:05")).not.toBeNull();
		expect(parseDateTime("2026-02-30T10:00")).toBeNull();
		expect(parseDateTime("2026-11-25T24:00")).toBeNull();
		expect(parseDateTime("2026-11-25")).toBeNull();
		expect(parseDate("2026-13-01")).toBeNull();
		expect(parseTime("09:60")).toBeNull();
		expect(parseTime("09:00")).toEqual({ hour: 9, minute: 0 });
	});

	it("만든 문자열은 다시 읽으면 같은 값이에요", () => {
		const parts = { year: 2027, month: 1, day: 3, hour: 0, minute: 9 };
		expect(formatDateTime(parts)).toBe("2027-01-03T00:09");
		expect(parseDateTime(formatDateTime(parts))).toEqual(parts);
	});
});

describe("calendar math", () => {
	it("윤년과 월 길이를 알아요", () => {
		expect(daysInMonth(2028, 2)).toBe(29);
		expect(daysInMonth(2026, 2)).toBe(28);
		expect(daysInMonth(2026, 11)).toBe(30);
	});

	it("요일을 계산해요 (2026-11-25는 수요일)", () => {
		expect(weekdayOf({ year: 2026, month: 11, day: 25 })).toBe(3);
	});

	it("일과 월을 경계 너머로 옮겨요", () => {
		expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
		expect(addDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({ year: 2026, month: 2, day: 28 });
		expect(addMonths({ year: 2026, month: 1, day: 31 }, 1)).toEqual({ year: 2026, month: 2, day: 28 });
		expect(addMonths({ year: 2026, month: 1, day: 15 }, -1)).toEqual({ year: 2025, month: 12, day: 15 });
		expect(addMonths({ year: 2026, month: 11, day: 5 }, 14)).toEqual({ year: 2028, month: 1, day: 5 });
	});

	it("달력은 일요일 시작 6주이고 이번 달 칸을 표시해요", () => {
		const grid = monthGrid(2026, 11);
		expect(grid).toHaveLength(42);
		expect(weekdayOf(grid[0].date)).toBe(0);
		expect(grid.filter((cell) => cell.inMonth)).toHaveLength(30);
		expect(grid[0].date).toEqual({ year: 2026, month: 11, day: 1 });
	});
});

describe("display and clamp", () => {
	it("보이는 표기를 만들어요", () => {
		expect(displayDateTime("2026-11-25T21:00")).toBe("2026. 11. 25. (수) 21:00");
		expect(displayDateTime("")).toBeNull();
	});

	it("한국 시간 현재를 분 단위로 더해서 줘요", () => {
		const now = new Date("2026-11-25T14:30:00Z");
		expect(kstNow(0, now)).toBe("2026-11-25T23:30");
		expect(kstNow(45, now)).toBe("2026-11-26T00:15");
	});

	it("범위 밖 값은 가장 가까운 끝으로 맞춰요", () => {
		expect(clampDateTime("2026-01-01T00:00", "2026-02-01T00:00", "2026-03-01T00:00")).toBe("2026-02-01T00:00");
		expect(clampDateTime("2026-05-01T00:00", "2026-02-01T00:00", "2026-03-01T00:00")).toBe("2026-03-01T00:00");
		expect(clampDateTime("2026-02-10T00:00", "2026-02-01T00:00")).toBe("2026-02-10T00:00");
	});
});
