import { NextResponse } from "next/server";

import { requestRoleValidation } from "./panel";

// Fail-open on bot/Redis errors; the bot re-validates on button click.
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
