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
  invalidRoleIds: string[];
  error: string | null;
  status: number;
}

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
