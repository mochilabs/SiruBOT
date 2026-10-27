import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
	GUILD_SETTING_KEYS,
	GUILD_SETTINGS_DEFAULTS,
	type GuildSettings,
	guildSettingsSchema,
	parseSettingBody,
} from "./schemas";

/** Prisma 스키마 원문에서 model Guild 블록의 컬럼별 @default를 읽어요 — 봇 기본값과의 일치 검증용 */
function readPrismaGuildDefaults(): Record<string, unknown> {
	const schema = readFileSync(new URL("../../../../packages/prisma/src/schema.prisma", import.meta.url), "utf8");
	const start = schema.indexOf("model Guild {");
	const block = schema.slice(start, schema.indexOf("\n}", start));
	const defaults: Record<string, unknown> = {};
	for (const line of block.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
		const column = /^([A-Za-z]\w*)\s+[A-Za-z]\w*\??\s*(.*)$/.exec(trimmed);
		if (!column) continue;
		const [, name, tail] = column;
		const declared = /@default\((.*)\)\s*$/.exec(tail);
		// nullable 컬럼은 @default가 없어요 — Prisma 기본값은 null이에요
		defaults[name] = declared ? parsePrismaDefault(declared[1]) : null;
	}
	return defaults;
}

function parsePrismaDefault(raw: string): unknown {
	if (raw.startsWith('"')) return JSON.parse(raw);
	if (raw.startsWith("[")) return JSON.parse(raw);
	if (raw === "true") return true;
	if (raw === "false") return false;
	return Number(raw);
}

describe("guildSettingsSchema 허용 키 계약", () => {
	it("GUILD_SETTING_KEYS는 스키마 shape에서 도출돼요 — 33개 필드", () => {
		expect(GUILD_SETTING_KEYS).toEqual(Object.keys(guildSettingsSchema.shape));
		expect(GUILD_SETTING_KEYS).toHaveLength(33);
	});

	it("parseSettingBody가 허용 키는 받고 미등록 키는 400으로 거절해요", async () => {
		const ok = await parseSettingBody(
			new Request("http://localhost", { method: "PUT", body: JSON.stringify({ volume: 20 }) }),
			guildSettingsSchema,
			GUILD_SETTING_KEYS,
		);
		expect(ok.ok).toBe(true);

		const unknown = await parseSettingBody(
			new Request("http://localhost", { method: "PUT", body: JSON.stringify({ notASetting: 1 }) }),
			guildSettingsSchema,
			GUILD_SETTING_KEYS,
		);
		expect(unknown.ok).toBe(false);
	});

	it("기본값 31키 전수가 PUT 본문으로 그대로 통과해요 — 유효 필드가 거부되면 안 돼요", async () => {
		const result = await parseSettingBody(
			new Request("http://localhost", { method: "PUT", body: JSON.stringify(GUILD_SETTINGS_DEFAULTS) }),
			guildSettingsSchema,
			GUILD_SETTING_KEYS,
		);
		expect(result.ok).toBe(true);
	});
});

describe("길드 설정 기본값 파생 계약", () => {
	it("기본값 키와 스키마 키(=GUILD_SETTING_KEYS)가 전수 일치해요", () => {
		expect(Object.keys(GUILD_SETTINGS_DEFAULTS).sort()).toEqual([...GUILD_SETTING_KEYS].sort());
		expect(Object.keys(GUILD_SETTINGS_DEFAULTS)).toHaveLength(GUILD_SETTING_KEYS.length);
	});

	it("기본값이 스키마 검증을 전부 통과해요 — 범위·형식이 스키마와 어긋나면 실패", () => {
		const parsed = guildSettingsSchema.safeParse(GUILD_SETTINGS_DEFAULTS);
		expect(parsed.success).toBe(true);
	});

	it("기본값이 Prisma Guild의 @default와 같아요 — 봇이 새 행을 만들 때와 기본값이 달라지면 안 돼요", () => {
		const prismaDefaults = readPrismaGuildDefaults();
		for (const key of GUILD_SETTING_KEYS) {
			expect(Object.hasOwn(prismaDefaults, key), `${key} 컬럼이 Prisma Guild 모델에 없어요`).toBe(true);
			const expected = GUILD_SETTINGS_DEFAULTS[key as keyof GuildSettings];
			expect(prismaDefaults[key], `${key} 기본값이 Prisma @default와 달라요`).toEqual(expected);
		}
	});
});

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
