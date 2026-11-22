import { describe, expect, it } from "vitest";

import { guildSettingsSchema } from "@/lib/schemas";

import { toggleModuleDisabled } from "./modules-settings";

describe("toggleModuleDisabled", () => {
	it("끄면 꺼진 목록에 모듈 표 순서로 들어가고, 켜면 빠져요", () => {
		expect(toggleModuleDisabled([], "fun", false)).toEqual(["fun"]);
		expect(toggleModuleDisabled(["fun"], "music", false)).toEqual(["music", "fun"]);
		expect(toggleModuleDisabled(["music", "fun"], "fun", true)).toEqual(["music"]);
	});

	it("끌 수 없는 관리 모듈은 꺼지지 않아요", () => {
		expect(toggleModuleDisabled([], "admin", false)).toEqual([]);
	});
});

describe("guildSettingsSchema disabledModules", () => {
	it("문자열 목록을 받아요 (모르는 id 정리는 라우트가 해요)", () => {
		expect(guildSettingsSchema.safeParse({ disabledModules: ["fun", "admin"] }).success).toBe(true);
		expect(guildSettingsSchema.safeParse({ disabledModules: "fun" }).success).toBe(false);
		expect(guildSettingsSchema.safeParse({ disabledModules: Array.from({ length: 7 }, () => "fun") }).success).toBe(false);
	});
});
