// zodiac 회귀 계약 — 별자리 분기 경계(봇 ohaasaService와 동일)와 범위 밖 처리를 잠가요.
import { describe, expect, it } from "vitest";

import { getZodiac } from "./zodiac";

describe("getZodiac", () => {
	it("분기 경계일을 각 별자리의 첫/끝 날짜로 확인해요", () => {
		expect(getZodiac(3, 21)).toEqual({ code: "01", ko: "양자리" });
		expect(getZodiac(4, 19)).toEqual({ code: "01", ko: "양자리" });
		expect(getZodiac(4, 20)).toEqual({ code: "02", ko: "황소자리" });
		expect(getZodiac(12, 22)).toEqual({ code: "10", ko: "염소자리" });
		expect(getZodiac(1, 19)).toEqual({ code: "10", ko: "염소자리" });
		expect(getZodiac(1, 20)).toEqual({ code: "11", ko: "물병자리" });
		expect(getZodiac(2, 18)).toEqual({ code: "11", ko: "물병자리" });
		expect(getZodiac(2, 19)).toEqual({ code: "12", ko: "물고기자리" });
		expect(getZodiac(3, 20)).toEqual({ code: "12", ko: "물고기자리" });
	});

	it("12개월 전부가 하나의 별자리에 매핑돼요 (누락 없음)", () => {
		for (let month = 1; month <= 12; month += 1) {
			expect(getZodiac(month, 15)).not.toBeNull();
		}
	});

	it("범위를 벗어나면 null이에요", () => {
		expect(getZodiac(0, 15)).toBeNull();
		expect(getZodiac(13, 15)).toBeNull();
	});
});
