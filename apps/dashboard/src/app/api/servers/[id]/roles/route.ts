import { NextResponse } from "next/server";
import { guildRoleItemSchema } from "@sirubot/utils/guildData";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { dataApiFailResponse, forwardDataApiGet } from "@/lib/data-api/client";
import { READ_RATE } from "@/lib/rate-limit";
import type { DiscordRoleSummary } from "@/types/discord";

const rolesResponseSchema = z.object({
  roles: z.array(guildRoleItemSchema),
});

const ROLES_FALLBACK = "봇에서 역할 목록을 불러오지 못했어요.";

export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "roles-get",
  handler: async ({ guildId }) => {
    const result = await forwardDataApiGet<unknown>(`/v1/guilds/${guildId}/roles`);
    if (!result.ok) {
      return dataApiFailResponse(result, ROLES_FALLBACK);
    }

    const parsed = rolesResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      console.error("[roles] data-api 응답이 스키마와 맞지 않아요:", parsed.error);
      return NextResponse.json({ error: ROLES_FALLBACK }, { status: 502 });
    }

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
