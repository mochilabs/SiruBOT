// 플레이리스트 트랙 라우트 회귀 계약 — noembed 제목 정규화 정규식의 단일 소스를 잠가요.
import { describe, expect, it } from "vitest";

import { cleanYoutubeTitle } from "./clean-title";

describe("cleanYoutubeTitle", () => {
	it("Official Music Video 표기를 제거해요", () => {
		expect(cleanYoutubeTitle("Song Title (Official Music Video)")).toBe("Song Title");
		expect(cleanYoutubeTitle("Song Title [Official Music Video]")).toBe("Song Title");
		expect(cleanYoutubeTitle("Song Title (Official Video)")).toBe("Song Title");
	});

	it("제목만 있으면 그대로 돌려줘요", () => {
		expect(cleanYoutubeTitle("Song Title")).toBe("Song Title");
		expect(cleanYoutubeTitle("공식 뮤직비디오")).toBe("공식 뮤직비디오");
	});
});
