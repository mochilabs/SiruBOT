import { describe, expect, it } from "vitest";

import { buildDiscordEmbed, DISCORD_EMBED_MAX_BYTES, serializeDiscordEmbed } from "./discord-embed";

const input = {
	title: "시루봇",
	description: "음악 <재생> & 서버 관리",
	url: "https://example.com",
	imageUrl: "https://example.com/og.png",
	imageAlt: "시루봇",
	buttons: [
		{ label: "봇 초대하기", url: "https://example.com/invite" },
		{ label: "대시보드", url: "https://example.com/servers" }
	]
};

describe("discord component embed", () => {
	it("Container 하나에 링크 버튼만 담아요", () => {
		const { component } = buildDiscordEmbed(input);
		expect(component.type).toBe(17);
		const row = (component.components as { type: number; components?: { type: number; style: number }[] }[]).find((c) => c.type === 1);
		expect(row?.components?.every((b) => b.type === 2 && b.style === 5)).toBe(true);
	});

	it("HTML에 안전하도록 <, >, &를 이스케이프해요", () => {
		const json = serializeDiscordEmbed(buildDiscordEmbed(input));
		expect(json).not.toMatch(/[<>&]/);
		expect(JSON.parse(json).component.components[0].content).toContain("<재생> &");
	});

	it("3,000바이트를 넘으면 에러를 던져요", () => {
		expect(() => serializeDiscordEmbed(buildDiscordEmbed({ ...input, description: "가".repeat(DISCORD_EMBED_MAX_BYTES) }))).toThrow();
	});
});
