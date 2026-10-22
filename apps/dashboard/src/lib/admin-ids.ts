/**
 * 대시보드 운영자(OWNER) ID allowlist — 인프라 텔레메트리(/api/shards, /api/data-api) 노출 제한용.
 * DASHBOARD_ADMIN_IDS: comma separated Discord 유저 ID (예: "123456789012345678,987654321098765432")
 *
 * fail-closed 규칙: env가 설정되지 않으면 모두 차단해요 — 환경 변수 누락이 무단 열람으로 이어지지 않게
 * 기본값을 막는 방향으로 둬요. 운영 환경에서는 반드시 값을 설정해 주세요.
 */
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

/** 운영자 allowlist 적용 — env 미설정 전원 차단(fail-closed), 설정되면 포함된 id만 통과 */
export function isDashboardAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return getDashboardAdminIds().includes(userId);
}