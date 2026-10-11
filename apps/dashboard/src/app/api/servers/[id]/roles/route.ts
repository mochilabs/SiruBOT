import { NextResponse } from "next/server";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { forwardDataApiGet } from "@/lib/data-api";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";
import type { DiscordRoleSummary } from "@/types/discord";

/** data-api의 역할 한 항목(GET /v1/guilds/:id/roles 계약) — color는 Discord 숫자 값(0 이하 = 기본색)이에요 */
interface DataApiGuildRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}

/** data-api 응답 래퍼 */
interface DataApiGuildRolesResponse {
  roles: DataApiGuildRole[];
}

/** data-api가 본문을 못 주면(봇 무응답·Redis 장애·네트워크 실패) 돌려주는 기본 안내 */
const ROLES_FALLBACK = "봇에서 역할 목록을 불러오지 못했어요.";

/** data-api(봇 Redis 캐시)에서 역할 목록을 받아요 — @everyone과 봇 연동(관리) 역할은 제외해요. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = guardRateLimit(
    rateKey("roles-get", authz.userId, id),
    READ_RATE,
  );
  if (limited) return limited;

  const result = await forwardDataApiGet<DataApiGuildRolesResponse>(
    `/v1/guilds/${id}/roles`,
  );
  if (!result.ok) {
    // data-api의 한국어 안내는 upstream 상태와 함께 그대로 전달해요 — 본문이 비었으면 502로 감싸요.
    return NextResponse.json(
      { error: result.message ?? ROLES_FALLBACK },
      { status: result.message ? result.status : 502 },
    );
  }

  const payload = result.data;
  if (!payload || !Array.isArray(payload.roles)) {
    return NextResponse.json({ error: ROLES_FALLBACK }, { status: 502 });
  }

  // data-api가 주는 color는 숫자(음수·0 = 기본색)라 `#rrggbb` 문자열로 바꿔요 — 기본색은 null로 내려가요.
  const roles: DiscordRoleSummary[] = payload.roles
    .filter(
      (role): role is DataApiGuildRole =>
        typeof role === "object" &&
        role !== null &&
        role.id !== id &&
        role.managed !== true,
    )
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
}
