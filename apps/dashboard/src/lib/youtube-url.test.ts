// youtube-url 회귀 계약 — 클라이언트(add-track-modal·use-playlists)와 서버(tracks/route)가
// 공유하는 유튜브 링크 인식 정규식의 단일 소스를 잠가요.
import { describe, expect, it } from "vitest";

import { extractYoutubeVideoId, isYoutubeUrl } from "./youtube-url";

const ID = "dQw4w9WgXcQ";

describe("isYoutubeUrl", () => {
	it("표준 watch 링크·짧은 링크·임베드 링크를 인식해요", () => {
		expect(isYoutubeUrl(`https://www.youtube.com/watch?v=${ID}`)).toBe(true);
		expect(isYoutubeUrl(`https://youtu.be/${ID}`)).toBe(true);
		expect(isYoutubeUrl(`https://www.youtube.com/embed/${ID}`)).toBe(true);
		expect(isYoutubeUrl(`https://m.youtube.com/watch?v=${ID}&list=PL123`)).toBe(true);
	});

	it("앞뒤 공백을 무시해요", () => {
		expect(isYoutubeUrl(`  https://youtu.be/${ID}\n`)).toBe(true);
	});

	it("유튜브가 아니거나 ID가 11자리가 아니면 거절해요", () => {
		expect(isYoutubeUrl("https://example.com/watch?v=" + ID)).toBe(false);
		expect(isYoutubeUrl(`https://youtu.be/${ID.slice(0, 10)}`)).toBe(false);
		expect(isYoutubeUrl("냥냥냥")).toBe(false);
		expect(isYoutubeUrl("")).toBe(false);
	});
});

describe("extractYoutubeVideoId", () => {
	it("형식에 관계없이 11자리 비디오 ID를 뽑아요", () => {
		expect(extractYoutubeVideoId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
		expect(extractYoutubeVideoId(`https://youtu.be/${ID}?t=42`)).toBe(ID);
	});

	it("유튜브 링크가 아니면 null이에요", () => {
		expect(extractYoutubeVideoId("https://example.com")).toBeNull();
		expect(extractYoutubeVideoId("")).toBeNull();
	});
});
