import { describe, expect, it } from "vitest";

import { hexToHsv, hsvToHex, normalizeHex } from "./color";

describe("hexToHsv / hsvToHex", () => {
	it("기준 색을 HSV로 정확히 분해한다", () => {
		expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
		expect(hexToHsv("#00ff00")).toEqual({ h: 120, s: 1, v: 1 });
		expect(hexToHsv("#0000ff")).toEqual({ h: 240, s: 1, v: 1 });
		expect(hexToHsv("#000000")).toEqual({ h: 0, s: 0, v: 0 });
		expect(hexToHsv("#ffffff")).toEqual({ h: 0, s: 0, v: 1 });
	});

	it("HSV를 HEX로 되돌리면 같은 색이 나온다", () => {
		for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#123456", "#ffdaff", "#a3416f", "#ffffff", "#000000"]) {
			const { h, s, v } = hexToHsv(hex);
			expect(hsvToHex(h, s, v)).toBe(hex);
		}
	});

	it("무채색에서도 색상(h) 값은 유지한다 (계산 결과만)", () => {
		// 흰색은 채도가 0이라 색상이 빠지지만, hsvToHex는 받은 h를 계산에 쓴다
		expect(hsvToHex(120, 0, 1)).toBe("#ffffff");
		expect(hsvToHex(120, 1, 1)).toBe("#00ff00");
	});

	it("0~1 밖의 채도·명도와 360 밖의 색상은 안쪽으로 고정한다", () => {
		expect(hsvToHex(0, 2, 2)).toBe("#ff0000");
		expect(hsvToHex(0, -1, -1)).toBe("#000000");
		expect(hsvToHex(360, 1, 1)).toBe("#ff0000");
		expect(hsvToHex(-360, 1, 1)).toBe("#ff0000");
	});

	it("형식이 맞지 않는 HEX는 흰색으로 떨어진다", () => {
		expect(hexToHsv("nope")).toEqual({ h: 0, s: 0, v: 1 });
		expect(hexToHsv("#12345")).toEqual({ h: 0, s: 0, v: 1 });
	});
});

describe("normalizeHex", () => {
	it("대문자·공백을 정리해 소문자 #rrggbb로 만든다", () => {
		expect(normalizeHex("  #FFDAFF ")).toBe("#ffdaff");
	});

	it("형식이 맞지 않으면 null", () => {
		expect(normalizeHex("ffdaff")).toBeNull();
		expect(normalizeHex("#12345")).toBeNull();
		expect(normalizeHex("")).toBeNull();
	});
});
