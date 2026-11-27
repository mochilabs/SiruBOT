import { NextResponse } from "next/server";
import { Prisma } from "@sirubot/prisma";
import { type GreetingConfig, greetingConfigSchema, validateGreetingConfig } from "@sirubot/utils/memberGreeting";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { notifyGuildSettingsChanged } from "@/lib/data-api/client";
import { db } from "@/lib/db";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";
import { parseSettingBody } from "@/lib/schemas";
import type { GreetingPair } from "@/types/member-greeting";

const ALLOWED_KEYS = ["welcome", "goodbye"] as const;

// 배경 dataURI(최대 150만 자, 공용 스키마 상한)가 본문에 같이 오니 zod 검증이 내 요청 크기의 유일한 한도역할이에요.
const patchSchema = z.object({
	welcome: greetingConfigSchema.nullable().optional(),
	goodbye: greetingConfigSchema.nullable().optional(),
});

function readConfig(value: unknown): GreetingConfig | null {
	if (value === null || value === undefined) return null;
	return validateGreetingConfig(value);
}

async function readPair(id: string): Promise<GreetingPair> {
	const guild = await db.guild.findUnique({ where: { id }, select: { welcome: true, goodbye: true } });
	return { welcome: readConfig(guild?.welcome), goodbye: readConfig(guild?.goodbye) };
}

function asJsonWrite(value: GreetingConfig | null | undefined) {
	return value === null ? Prisma.DbNull : value;
}

export const GET = createGuildApiHandler({
	role: "manage",
	rate: READ_RATE,
	key: "greeting-get",
	handler: async ({ guildId }) => {
		try {
			return NextResponse.json(await readPair(guildId));
		} catch (error) {
			console.error(`Failed to load guild greeting (guild ${guildId}):`, error);
			return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
		}
	},
});

export const PATCH = createGuildApiHandler({
	role: "manage",
	rate: WRITE_RATE,
	key: "greeting-patch",
	handler: async ({ guildId, request }) => {
		try {
			const body = await parseSettingBody(request, patchSchema, ALLOWED_KEYS);
			if (!body.ok) return body.response;

			const data = body.data;
			if ("welcome" in data || "goodbye" in data) {
				const { welcome, goodbye } = data;
				await db.guild.upsert({
					where: { id: guildId },
					create: { id: guildId, welcome: asJsonWrite(welcome), goodbye: asJsonWrite(goodbye) },
					update: {
						...(welcome !== undefined ? { welcome: asJsonWrite(welcome) } : {}),
						...(goodbye !== undefined ? { goodbye: asJsonWrite(goodbye) } : {}),
					},
				});
			}

			const pair = await readPair(guildId);

			notifyGuildSettingsChanged(guildId).catch((error) => {
				console.warn(`Failed to notify guild settings change (guild ${guildId}):`, error);
			});

			return NextResponse.json(pair);
		} catch (error) {
			console.error(`Failed to update guild greeting (guild ${guildId}):`, error);
			return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
		}
	},
});
