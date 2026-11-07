import { NextResponse } from "next/server";

import { requestRoleValidation } from "./panel";

/**
 * 저장 전 역할 부여 가능 여부 검증 — 봇이 "부여 불가"로 판정한 역할이 있으면 400 응답을 돌려줘요.
 * 통신 장애(봇 다운·Redis timeout)는 막지 않고 통과해요 (클릭 시점에 봇이 다시 검증해요).
 * 통과면 null.
 */
export async function rejectUnassignableRoles(
  guildId: string,
  roleIds: string[],
): Promise<NextResponse | null> {
  const unique = [...new Set(roleIds)];
  if (unique.length === 0) return null;
  const validation = await requestRoleValidation(guildId, unique);
  if (validation.ok && validation.invalidRoleIds.length > 0) {
    return NextResponse.json(
      {
        error:
          "부여할 수 없는 역할이 포함되어 있어요. 관리형·@everyone·봇보다 높은 역할이나 관리자급 권한이 있는 역할은 쓸 수 없어요.",
        invalidRoleIds: validation.invalidRoleIds,
      },
      { status: 400 },
    );
  }
  return null;
}
