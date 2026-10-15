import { describe, expect, it } from "vitest";

import { guildSettingsSchema } from "./schemas";

describe("guildSettingsSchema 크로스페이드 범위", () => {
	it("0.5초(500ms) ~ 15초(15000ms) 사이만 받아들여요", () => {
		expect(guildSettingsSchema.safeParse({ crossfadeMs: 500 }).success).toBe(true);
		expect(guildSettingsSchema.safeParse({ crossfadeMs: 12500 }).success).toBe(true);
		expect(guildSettingsSchema.safeParse({ crossfadeMs: 15000 }).success).toBe(true);
		expect(guildSettingsSchema.safeParse({ crossfadeMs: 499 }).success).toBe(false);
		expect(guildSettingsSchema.safeParse({ crossfadeMs: 15001 }).success).toBe(false);
		// Lavalink mixer 플러그인 상한(15초)이 늘어나면 이 계약도 함께 옮겨져야 해요
	});

	it("범위를 벗어나면 한국어 안내로 거절해요", () => {
		const over = guildSettingsSchema.safeParse({ crossfadeMs: 20000 });
		expect(over.success).toBe(false);
		if (!over.success) {
			expect(over.error.issues[0].message).toBe("크로스페이드는 15초 이하여야 해요.");
		}
		const under = guildSettingsSchema.safeParse({ crossfadeMs: 100 });
		expect(under.success).toBe(false);
		if (!under.success) {
			expect(under.error.issues[0].message).toBe("크로스페이드는 0.5초 이상이에요.");
		}
	});
});