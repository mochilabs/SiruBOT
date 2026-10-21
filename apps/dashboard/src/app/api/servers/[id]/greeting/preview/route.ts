import { NextResponse } from "next/server";
import { greetingConfigSchema, type GreetingKind } from "@sirubot/utils/memberGreeting";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { auth } from "@/lib/auth";
import { dataApiFailResponse, forwardDataApiImage } from "@/lib/data-api";
import { RENDER_RATE } from "@/lib/rate-limit";

const previewSchema = z.object({
	kind: z.enum(["welcome", "goodbye"], "kind는 welcome 또는 goodbye여야 해요."),
	config: greetingConfigSchema,
});

/**
 * 서버 이름·멤버 수 미니 캐시 — 프리뷰 요청(드래그 400ms 디바운스)마다 Discord를 다치지 않게 60초 유지해요.
 * with_counts=true의 approximate_member_count는 근사값이에요 (정확한 멤버 수는 Discord가 안 주는 값).
 */
const GUILD_META_TTL_MS = 60_000;
const GUILD_META_MAX_ENTRIES = 1_000;

interface GuildMeta {
	name: string | null;
	/** 근사 멤버 수 — Discord 장애이면 0 (미리보기 부제에서 0으로 나타나는 건 이 사실이에요) */
	memberCount: number;
}

const guildMetaCache = new Map<string, { expires: number; meta: GuildMeta }>();

function readGuildMetaCache(id: string): GuildMeta | null {
	const cached = guildMetaCache.get(id);
	if (!cached) return null;
	if (cached.expires <= Date.now()) {
		guildMetaCache.delete(id);
		return null;
	}
	return cached.meta;
}

async function getGuildMeta(accessToken: string, id: string): Promise<GuildMeta> {
	const cached = readGuildMetaCache(id);
	if (cached) return cached;

	const meta: GuildMeta = { name: null, memberCount: 0 };
	try {
		const res = await fetch(`https://discord.com/api/v10/guilds/${id}?with_counts=true`, {
			headers: { Authorization: `Bearer ${accessToken}` },
			cache: "no-store",
		});
		if (res.ok) {
			const body = (await res.json()) as { name?: unknown; approximate_member_count?: unknown };
			if (typeof body.name === "string" && body.name) meta.name = body.name;
			if (typeof body.approximate_member_count === "number" && body.approximate_member_count >= 0) {
				meta.memberCount = body.approximate_member_count;
			}
		}
		// 기타 응답 — 이름·멤버 수 모르면 null/0으로 그려요 (부제 {멤버수}가 0으로 나타나요)
	} catch {
		// Discord 장애 — null/0 폴백
	}
	if (guildMetaCache.size >= GUILD_META_MAX_ENTRIES) {
		guildMetaCache.clear();
	}
	guildMetaCache.set(id, { expires: Date.now() + GUILD_META_TTL_MS, meta });
	return meta;
}

/**
 * 인사 카드 이미지 미리보기 — data-api /v1/image/member-card를 프록시해 PNG로 돌려줘요.
 * context는 실제로 파악할 수 있는 값만 써요: 로그인 세션의 Discord id·이름·아바타와
 * Discord API 근사 멤버 수(60초 캐시). 이름은 세션 시점 값이라 닉네임 변경 후 재로그인 전이면 낡아 있어요.
 */
export const POST = createGuildApiHandler({
	role: "manage",
	rate: RENDER_RATE,
	key: "greeting-preview",
	schema: previewSchema,
	handler: async ({ guildId, authz, data }) => {
		try {
			const session = await auth();
			const name = session?.user?.name ?? null;
			const displayName = name && name.length <= 64 ? name : "유저";
			const meta = await getGuildMeta(authz.token, guildId);

			const result = await forwardDataApiImage("/v1/image/member-card", {
				guildId,
				kind: data.kind satisfies GreetingKind,
				config: data.config,
				context: {
					userId: authz.userId,
					username: displayName,
					displayName,
					guildName: meta.name,
					avatarUrl: session?.user?.image ?? null,
					memberCount: meta.memberCount,
				},
			});
			if (!result.ok) {
				return dataApiFailResponse(
					result,
					"미리보기를 그리지 못했어요. 이미지 서버 상태를 확인해 주세요.",
				);
			}

			return new Response(result.buffer, {
				status: 200,
				headers: { "Content-Type": result.contentType, "Cache-Control": "no-store" },
			});
		} catch (error) {
			console.error(`Failed to render greeting preview (guild ${guildId}):`, error);
			return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
		}
	},
});
