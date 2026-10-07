/**
 * 대시보드 운영자(OWNER) ID allowlist — 인프라 텔레메트리(/api/shards, /api/data-api) 노출 제한용.
 * DASHBOARD_ADMIN_IDS: comma separated Discord 유저 ID (예: "123456789012345678,987654321098765432")
 *
 * fail-open 규칙: env가 설정되지 않으면 모든 로그인 유저가 열람 가능 (기존 동작 유지),
 * 설정되면 allowlist에 포함된 유저만 통과해요.
 */
export function getDashboardAdminIds(): string[] {
  const raw = (process.env.DASHBOARD_ADMIN_IDS ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/** 운영자 allowlist 적용 — allowlist가 비면(true) 전원 허용(기존 동작), 아니면 포함된 id만 */
export function isDashboardAdmin(userId: string | null | undefined): boolean {
  const admins = getDashboardAdminIds();
  if (admins.length === 0) return true;
  return Boolean(userId) && admins.includes(userId!);
}
