import { getDashboardAdminIdsRaw } from "@/lib/env";

let warnedUnset = false;

function getDashboardAdminIds(): string[] {
  const raw = getDashboardAdminIdsRaw();
  if (!raw) {
    if (!warnedUnset) {
      warnedUnset = true;
      console.warn(
        "[admin-ids] DASHBOARD_ADMIN_IDS 미설정 — 대시보드 운영자 API(/api/shards, /api/data-api)는 모두 차단돼요. Discord 유저 ID를 설정해 주세요.",
      );
    }
    return [];
  }
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export function isDashboardAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return getDashboardAdminIds().includes(userId);
}