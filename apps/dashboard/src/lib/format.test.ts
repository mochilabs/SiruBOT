// format 회귀 계약 — 상대 시간 경계(방금/초/분/시간/일·7일 초과 날짜)와 메모리 표기를 잠가요.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatMemory, formatRelativeTime, formatRelativeTimeFromISO } from "./format";

let fakeNowMs = 0;

beforeEach(() => {
	fakeNowMs = Date.parse("2026-10-22T12:00:00Z");
	vi.spyOn(Date, "now").mockImplementation(() => fakeNowMs);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("formatRelativeTime (epoch ms)", () => {
	it("5초 미만은 '방금 전'이에요", () => {
		expect(formatRelativeTime(fakeNowMs)).toBe("방금 전");
		expect(formatRelativeTime(fakeNowMs - 4000)).toBe("방금 전");
	});

	it("경계값을 넘기면 단위가 커져요 (5초/60초/3600초)", () => {
		expect(formatRelativeTime(fakeNowMs - 5000)).toBe("5초 전");
		expect(formatRelativeTime(fakeNowMs - 59_000)).toBe("59초 전");
		expect(formatRelativeTime(fakeNowMs - 60_000)).toBe("1분 전");
		expect(formatRelativeTime(fakeNowMs - 3_599_000)).toBe("59분 전");
		expect(formatRelativeTime(fakeNowMs - 3_600_000)).toBe("1시간 전");
	});
});

describe("formatRelativeTimeFromISO (ISO 문자열)", () => {
	it("1분 미만은 '방금', 그 경계부터 분/시간/일 단위예요", () => {
		expect(formatRelativeTimeFromISO(new Date(fakeNowMs - 30_000).toISOString())).toBe("방금");
		expect(formatRelativeTimeFromISO(new Date(fakeNowMs - 60_000).toISOString())).toBe("1분 전");
		expect(formatRelativeTimeFromISO(new Date(fakeNowMs - 3_600_000).toISOString())).toBe("1시간 전");
		expect(formatRelativeTimeFromISO(new Date(fakeNowMs - 86_400_000).toISOString())).toBe("1일 전");
	});

	it("7일 넘으면 절대 날짜(월·일)로 바뀌어요", () => {
		const weekAgo = new Date(fakeNowMs - 7 * 86_400_000).toISOString();
		expect(formatRelativeTimeFromISO(weekAgo)).toMatch(/월 \d+일/);
	});
});

describe("formatMemory", () => {
	it("바이트를 반올림한 MB로 표기해요", () => {
		expect(formatMemory(0)).toBe("0MB");
		expect(formatMemory(512 * 1024 * 1024)).toBe("512MB");
		expect(formatMemory(1.4 * 1024 * 1024)).toBe("1MB");
		expect(formatMemory(1.6 * 1024 * 1024)).toBe("2MB");
	});
});
