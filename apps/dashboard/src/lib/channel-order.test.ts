import { describe, expect, it } from "vitest";

import { ChannelTypeValue, type DiscordChannelSummary } from "@/types/discord";

import { sortChannelsForDisplay } from "./channel-order";

function channel(
  id: string,
  type: number,
  parentId: string | null,
  position: number,
): DiscordChannelSummary {
  return { id, name: id, type, parentId, position };
}

/**
 * discord.js가 보내는 position은 "같은 부모 + 같은 정렬 그룹" 안에서의 인덱스예요.
 * 아래 표본도 그 규칙 그대로 만들었어요 (uncategorized 텍스트 0/1, 음성 0).
 */
const MIXED: DiscordChannelSummary[] = [
  channel("b", ChannelTypeValue.GuildCategory, null, 1),
  channel("a-voice", ChannelTypeValue.GuildVoice, "a", 0),
  channel("news", ChannelTypeValue.GuildAnnouncement, null, 1),
  channel("b-text", ChannelTypeValue.GuildText, "b", 0),
  channel("a", ChannelTypeValue.GuildCategory, null, 0),
  channel("vc", ChannelTypeValue.GuildVoice, null, 0),
  channel("a-text", ChannelTypeValue.GuildText, "a", 0),
  channel("general", ChannelTypeValue.GuildText, null, 0),
];

describe("sortChannelsForDisplay", () => {
	it("카테고리 없는 채널 → 카테고리 머리글 → 그 안의 채널 순서로 놓는다", () => {
		expect(sortChannelsForDisplay(MIXED).map((c) => c.id)).toEqual([
			"general",
			"news",
			"vc",
			"a",
			"a-text",
			"a-voice",
			"b",
			"b-text",
		]);
	});

	it("같은 묶음 안에서는 텍스트가 음성보다 먼저다", () => {
		const sorted = sortChannelsForDisplay(MIXED).map((c) => c.id);
		expect(sorted.indexOf("a-text")).toBeLessThan(sorted.indexOf("a-voice"));
		expect(sorted.indexOf("general")).toBeLessThan(sorted.indexOf("vc"));
	});

	it("카테고리는 position 순서로 놓인다", () => {
		const sorted = sortChannelsForDisplay(MIXED).map((c) => c.id);
		expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("b"));
	});

	it("position이 겹치는 채널이 있어도 섞이지 않고 안정적으로 정렬된다", () => {
		const sorted = sortChannelsForDisplay(MIXED).map((c) => c.id);
		expect(new Set(sorted).size).toBe(MIXED.length);
		expect(sortChannelsForDisplay(MIXED).map((c) => c.id)).toEqual(sorted);
	});

	it("부모 카테고리가 목록에 없으면 맨 위 묶음으로 떨어진다", () => {
		const orphan = channel("orphan", ChannelTypeValue.GuildText, "gone", 5);
		const sorted = sortChannelsForDisplay([...MIXED, orphan]).map((c) => c.id);
		expect(sorted).toEqual([
			"general",
			"news",
			"orphan",
			"vc",
			"a",
			"a-text",
			"a-voice",
			"b",
			"b-text",
		]);
	});
});
