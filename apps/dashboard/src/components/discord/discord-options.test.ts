import { describe, expect, it } from "vitest";

import { ChannelTypeValue, type DiscordChannelSummary } from "@/types/discord";

import { buildChannelOptions, buildRoleOptions } from "./discord-options";

function channel(
  id: string,
  type: number,
  parentId: string | null,
  position: number,
): DiscordChannelSummary {
  return { id, name: id, type, parentId, position };
}

const CHANNELS: DiscordChannelSummary[] = [
  channel("b", ChannelTypeValue.GuildCategory, null, 1),
  channel("b-text", ChannelTypeValue.GuildText, "b", 0),
  channel("a", ChannelTypeValue.GuildCategory, null, 0),
  channel("a-text", ChannelTypeValue.GuildText, "a", 0),
  channel("general", ChannelTypeValue.GuildText, null, 0),
];

describe("buildChannelOptions", () => {
	it("Discord 순서로 나열하고 카테고리별로 묶는다", () => {
		const options = buildChannelOptions(CHANNELS, {
			types: [ChannelTypeValue.GuildText],
		});
		expect(options.map((option) => option.value)).toEqual([
			"general",
			"a-text",
			"b-text",
		]);
		expect(options.map((option) => option.group)).toEqual([
			"카테고리 없음",
			"a",
			"b",
		]);
	});

	it("목록에 없는 선택값은 삭제된 채널로 남긴다", () => {
		const options = buildChannelOptions(CHANNELS, {
			types: [ChannelTypeValue.GuildText],
			selectedIds: ["gone-1"],
		});
		expect(options.at(-1)).toMatchObject({
			value: "gone-1",
			group: "삭제된 채널",
		});
	});

	it("이미 목록에 있는 선택값은 중복으로 넣지 않는다", () => {
		const options = buildChannelOptions(CHANNELS, {
			types: [ChannelTypeValue.GuildText],
			selectedIds: ["general"],
		});
		expect(options.filter((option) => option.value === "general")).toHaveLength(1);
	});

	it("noneLabel을 주면 맨 앞에 선택 안 함 항목을 넣는다", () => {
		const options = buildChannelOptions(CHANNELS, { noneLabel: "사용 안 함" });
		expect(options[0]).toMatchObject({ value: "", label: "사용 안 함" });
	});

	it("groupByCategory를 끄면 그룹 없이 나열한다", () => {
		const options = buildChannelOptions(CHANNELS, {
			types: [ChannelTypeValue.GuildCategory],
			groupByCategory: false,
		});
		expect(options.map((option) => option.value)).toEqual(["a", "b"]);
		expect(options.every((option) => option.group === undefined)).toBe(true);
	});
});

describe("buildRoleOptions", () => {
	const roles = [
		{ id: "low", name: "아래", color: null, position: 1, managed: false },
		{ id: "top", name: "위", color: "#ff0000", position: 10, managed: false },
	];

	it("역할은 위에서 아래(position 큰 순)로 나열한다", () => {
		expect(buildRoleOptions(roles).map((option) => option.value)).toEqual([
			"top",
			"low",
		]);
	});

	it("목록에 없는 선택값은 삭제된 역할로 남긴다", () => {
		const options = buildRoleOptions(roles, { selectedIds: ["gone"] });
		expect(options.at(-1)).toMatchObject({
			value: "gone",
			label: "gone (삭제된 역할)",
		});
	});
});
