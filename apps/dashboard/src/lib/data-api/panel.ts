/**
 * 패널 게시·역할 검증 — 봇에 위임하는 data-api 프록시 헬퍼예요.
 *
 * 패널 메시지(커스텀 ID 버튼 포함) 게시와 역할 부여 가능 여부 검증은 봇 토큰으로만 가능해요.
 * 대시보드가 data-api `/v1/internal/panel/post`·`/v1/internal/role-panel/validate-roles`를 호출하면
 * data-api가 Redis request/reply로 봇에 전달해요. 봇 미응답·Redis 장애는 status로 내려줘요.
 */
import { forwardDataApiPost } from "./client";

export interface PanelPostApiResult {
  ok: boolean;
  messageId: string | null;
  channelId: string | null;
  error: string | null;
  status: number;
}

export interface RoleValidationApiResult {
  ok: boolean;
  /** 부여 불가능한 roleId 목록 — 비어 있으면 전부 가능해요 */
  invalidRoleIds: string[];
  error: string | null;
  status: number;
}

/**
 * 패널 메시지 게시를 봇에 위임해요. 서버 전용이에요 — 대시보드 API 라우트에서만 import하고,
 * 클라이언트 컴포넌트는 /api/servers/[id]/.../post 라우트를 fetch해요.
 * refresh: true면 새로 보내지 않고 게시된 메시지를 제자리에서 갱신해요.
 * type: 'ticket'은 panelId 불필요(1:1), 'rolePanel'은 panelId 필요(1:N).
 */
export async function requestPanelPost(
  guildId: string,
  type: "ticket" | "rolePanel",
  options: { panelId?: string; channelId?: string; refresh?: boolean } = {},
): Promise<PanelPostApiResult> {
  const result = await forwardDataApiPost<{
    ok: true;
    messageId: string | null;
    channelId: string | null;
  }>("/v1/internal/panel/post", { guildId, type, ...options });
  if (!result.ok) {
    return {
      ok: false,
      messageId: null,
      channelId: null,
      error: result.message ?? null,
      status: result.status,
    };
  }
  return {
    ok: true,
    messageId: result.data.messageId ?? null,
    channelId: result.data.channelId ?? null,
    error: null,
    status: 200,
  };
}

/**
 * 저장 전 역할 부여 가능 여부 검증을 봇에 위임해요.
 * invalidRoleIds가 비어 있으면 전부 부여 가능해요.
 */
export async function requestRoleValidation(
  guildId: string,
  roleIds: string[],
): Promise<RoleValidationApiResult> {
  const result = await forwardDataApiPost<{
    ok: true;
    invalidRoleIds: string[];
  }>("/v1/internal/role-panel/validate-roles", { guildId, roleIds });
  if (!result.ok) {
    return {
      ok: false,
      invalidRoleIds: [],
      error: result.message ?? null,
      status: result.status,
    };
  }
  return {
    ok: true,
    invalidRoleIds: result.data.invalidRoleIds ?? [],
    error: null,
    status: 200,
  };
}
