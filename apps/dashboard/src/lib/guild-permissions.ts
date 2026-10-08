const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

/** 길드 권한 비트에 Manage Guild 또는 Administrator가 포함되는지 */
export function hasManageablePermissions(
  permissions: string | number | bigint,
): boolean {
  try {
    const bits = BigInt(permissions);
    return (
      (bits & MANAGE_GUILD) === MANAGE_GUILD ||
      (bits & ADMINISTRATOR) === ADMINISTRATOR
    );
  } catch {
    return false;
  }
}

/** 사용자 토큰으로 서버 관리 권한(Manage Guild/Administrator) 확인 */
export async function canManage(
  accessToken: string,
  guildId: string,
): Promise<boolean> {
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const guilds: Array<{ id: string; permissions: string | number }> =
      await res.json();
    const guild = guilds.find((g) => g.id === guildId);
    if (!guild) return false;
    return hasManageablePermissions(guild.permissions);
  } catch {
    return false;
  }
}
