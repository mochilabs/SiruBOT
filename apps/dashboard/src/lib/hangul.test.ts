// hangul 회귀 계약 — 한글 자소 분해(초성 → 초+중성 → 완성글자)의 타이핑 중간 상태 배열과
// 한글 밖 문자 처리를 잠가요.
import { describe, expect, it } from "vitest";

import { decomposeHangul } from "./hangul";

describe("decomposeHangul", () => {
	it("자음받침 글자는 초성 → 초+중성 → 완성글자 3단계예요", () => {
		expect(decomposeHangul("한")).toEqual(["ㅎ", "하", "한"]);
	});

	it("모음만 받친 글자는 초성 → 완성글자 2단계예요 (중간형 없음)", () => {
		expect(decomposeHangul("가")).toEqual(["ㄱ", "가"]);
	});

	it("쌍자음·복합받침도 분해해요", () => {
		expect(decomposeHangul("까")[0]).toBe("ㄲ");
		expect(decomposeHangul("닭")).toHaveLength(3); // ㄷ → 닥 → 닭
	});

	it("한글이 아닌 문자는 그대로 1요소 배열이에요", () => {
		expect(decomposeHangul("a")).toEqual(["a"]);
		expect(decomposeHangul("😀")).toEqual(["😀"]);
		expect(decomposeHangul(" ")).toEqual([" "]);
	});

	it("모든 완성형 한글이 자기 자신으로 돌아와요 (분해-재조립 무손실)", () => {
		for (const char of "가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호") {
			const states = decomposeHangul(char);
			expect(states.at(-1)).toBe(char);
		}
	});
});
