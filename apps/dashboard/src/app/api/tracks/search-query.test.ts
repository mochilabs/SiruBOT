// tracks 차트 검색 회귀 계약 — ILIKE 와일드카드 이스케이프의 단일 소스를 잠가요.
import { describe, expect, it } from "vitest";

import { escapeLikeWildcard } from "./search-query";

describe("escapeLikeWildcard", () => {
	it("%와 _를 리터럴로 취급하도록 이스케이프해요", () => {
		expect(escapeLikeWildcard("100%")).toBe("100\\%");
		expect(escapeLikeWildcard("a_b")).toBe("a\\_b");
		expect(escapeLikeWildcard("%_%")).toBe("\\%\\_\\%");
	});

	it("백슬래시를 먼저 이스케이프해 중복 치환이 깨지지 않게 해요", () => {
		expect(escapeLikeWildcard("a\\b")).toBe("a\\\\b");
		expect(escapeLikeWildcard("\\%")).toBe("\\\\\\%");
	});

	it("이스케이프 대상이 없으면 원문을 그대로 돌려줘요", () => {
		expect(escapeLikeWildcard("시루봇")).toBe("시루봇");
		expect(escapeLikeWildcard("")).toBe("");
	});
});
