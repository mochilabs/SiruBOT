import { NextResponse } from "next/server";
import { guildRoleItemSchema } from "@sirubot/utils/guildData";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { forwardDataApiGet } from "@/lib/data-api/client";
import { READ_RATE } from "@/lib/rate-limit";
import type { DiscordRoleSummary } from "@/types/discord";

/** data-api 역할 목록 응답(GET /v1/guilds/:id/roles) — 항목 계약은 @sirubot/utils의 단일 정의를 그대로 써요 */
const rolesResponseSchema = z.object({
  roles: z.array(guildRoleItemSchema),
});

/** data-api가 본문을 못 주면(봇 무응답·Redis 장애·네트워크 실패) 돌려주는 기본 안내 */
const ROLES_FALLBACK = "봇에서 역할 목록을 불러오지 못했어요.";

/** data-api(Redis request/reply — 봇이 discord.js 캐시에서 읽어 응답)에서 역할 목록을 받아요. @everyone과 봇 연동(관리) 역할은 제외해요. */
export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "roles-get",
  handler: async ({ guildId }) => {
    const result = await forwardDataApiGet<unknown>(`/v1/guilds/${guildId}/roles`);
    if (!result.ok) {
      // data-api의 한국어 안내는 upstream 상태와 함께 그대로 전달해요 — 본문이 비었으면 502로 감싸요.
      return NextResponse.json(
        { error: result.message ?? ROLES_FALLBACK },
        { status: result.message ? result.status : 502 },
      );
    }

    // 응답 본문을 공용 스키마로 검증해요 — 계약이 어긋나면 서버 로그만 남기고 기존 폴백(502)으로 응답해요.
    const parsed = rolesResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      console.error("[roles] data-api 응답이 스키마와 맞지 않아요:", parsed.error);
      return NextResponse.json({ error: ROLES_FALLBACK }, { status: 502 });
    }

    // data-api가 주는 color는 숫자(음수·0 = 기본색)라 `#rrggbb` 문자열로 바꿔요 — 기본색은 null로 내려가요.
    const roles: DiscordRoleSummary[] = parsed.data.roles
      .filter((role) => role.id !== guildId && role.managed !== true)
      .map((role) => {
        const color = role.color > 0 ? role.color : null;
        return {
          id: role.id,
          name: role.name || "이름 없는 역할",
          color:
            color !== null ? `#${color.toString(16).padStart(6, "0")}` : null,
          position: role.position,
          managed: false,
        };
      })
      .sort((a, b) => b.position - a.position);

    return NextResponse.json({ roles });
  },
});
