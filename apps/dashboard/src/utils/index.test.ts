import { describe, expect, it } from "vitest";

import { prettySourceName } from "./index";

describe("prettySourceName", () => {
	it("youtube-file-cache 캐시 재생을 Youtube로 바꿔요", () => {
		expect(prettySourceName("youtube-file-cache")).toBe("Youtube");
	});

	it("알 수 없는 소스는 원문을 그대로 돌려줘요", () => {
		expect(prettySourceName("deezer")).toBe("deezer");
	});
});