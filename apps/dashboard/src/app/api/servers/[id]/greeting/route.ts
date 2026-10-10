import { NextResponse } from "next/server";
import { Prisma } from "@sirubot/prisma";
import { z } from "zod";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { notifyGuildSettingsChanged } from "@/lib/data-api";
import { db } from "@/lib/db";
import { greetingConfigSchema, validateGreetingConfig } from "@/lib/greeting-schema";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";
import { unknownKeys, zodError } from "@/lib/schemas";
import type { GreetingPair } from "@/types/member-greeting";
import { type GreetingConfig } from "@/types/member-greeting";

const ALLOWED_KEYS = ["welcome", "goodbye"] as const;

// 배경 dataURI(최대 150만 자, 공용 스키마 상한)가 본문에 같이 오니 zod 검증이 내 요청 크기의 유일한 한도역할이에요.
const patchSchema = z.object({
	welcome: greetingConfigSchema.nullable().optional(),
	goodbye: greetingConfigSchema.nullable().optional(),
});

/** Prisma Json? 컬럼 읽기 — 공용 스키마 검증으로 깨진 저장값은 null로 취급해요 (UI가 기본값을 깔아요) */
function readConfig(value: unknown): GreetingConfig | null {
	if (value === null || value === undefined) return null;
	return validateGreetingConfig(value);
}

async function readPair(id: string): Promise<GreetingPair> {
	const guild = await db.guild.findUnique({ where: { id }, select: { welcome: true, goodbye: true } });
	return { welcome: readConfig(guild?.welcome), goodbye: readConfig(guild?.goodbye) };
}

/** JSON 컬럼 쓰기 — null 리셋은 DB NULL로 기록해요 (읽기는 null, 봇·UI는 기본값으로 폴백해요) */
function asJsonWrite(value: GreetingConfig | null | undefined) {
	return value === null ? Prisma.DbNull : value;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const authz = await authorizeGuildManage(id);
	if (!authz.ok) return deniedGuildManage(authz);
	try {
		return NextResponse.json(await readPair(id));
	} catch (error) {
		console.error(`Failed to load guild greeting (guild ${id}):`, error);
		return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
	}
}

/**
 * 인사 설정 저장 — 저장값이 없는 길드는 upsert로 Guild 행을 만들어요 (settings 라우트와 같은 방식).
 * null은 기본값 사용으로 저장해요 (봇도 Json 컬럼이 비어 있으면 자기 기본값으로 동작해요).
 * 저장 후 인사 설정 캐시 무효화를 봇 프로세스에 브로드캐스트해요 (settings 라우트와 같은 방식).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const authz = await authorizeGuildManage(id);
	if (!authz.ok) return deniedGuildManage(authz);

	const limited = guardRateLimit(rateKey("greeting-patch", authz.userId, id), WRITE_RATE);
	if (limited) return limited;

	try {
		const body: unknown = await request.json().catch(() => null);
		if (!body || typeof body !== "object" || Array.isArray(body)) {
			return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
		}

		const unknown = unknownKeys(body, ALLOWED_KEYS);
		if (unknown.length > 0) {
			return NextResponse.json({ error: `지원하지 않는 필드예요: ${unknown.join(", ")}` }, { status: 400 });
		}

		const parsed = patchSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ error: zodError(parsed.error) }, { status: 400 });
		}

		const data = parsed.data;
		if ("welcome" in data || "goodbye" in data) {
			const { welcome, goodbye } = data;
			await db.guild.upsert({
				where: { id },
				create: { id, welcome: asJsonWrite(welcome), goodbye: asJsonWrite(goodbye) },
				update: {
					...(welcome !== undefined ? { welcome: asJsonWrite(welcome) } : {}),
					...(goodbye !== undefined ? { goodbye: asJsonWrite(goodbye) } : {}),
				},
			});
		}

		const pair = await readPair(id);

		// 저장 성공 후 인사 설정 캐시 무효화 (fire-and-forget) — 실패해도 봇의 60초 TTL 폴백이 최신값을 읽어요.
		notifyGuildSettingsChanged(id).catch((error) => {
			console.warn(`Failed to notify guild settings change (guild ${id}):`, error);
		});

		return NextResponse.json(pair);
	} catch (error) {
		console.error(`Failed to update guild greeting (guild ${id}):`, error);
		return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
	}
}