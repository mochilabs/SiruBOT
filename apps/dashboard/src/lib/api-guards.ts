import { NextResponse } from "next/server";

import { isDashboardAdmin } from "@/lib/admin-ids";
import { auth } from "@/lib/auth";
import { resolveCanManage, resolveGuildMembership } from "@/lib/guild-permissions";
import { getSessionAccessToken } from "@/lib/session-token";

export type AuthorizeResult =
  | { ok: true; token: string; userId: string }
  | { ok: false; status: 401 | 403 | 502 };

export async function authorizeGuildManage(
  guildId: string,
): Promise<AuthorizeResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, status: 401 };
  const accessToken = await getSessionAccessToken();
  if (!accessToken) return { ok: false, status: 401 };

  const result = await resolveCanManage(accessToken, session.user.id, guildId);
  if (result.status === "invalid-token") return { ok: false, status: 401 };
  if (result.status === "unavailable")
    return { ok: false, status: 502 };
  if (!result.manageable) return { ok: false, status: 403 };
  return { ok: true, token: accessToken, userId: session.user.id };
}

export async function authorizeGuildMember(
  guildId: string,
): Promise<AuthorizeResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, status: 401 };
  const accessToken = await getSessionAccessToken();
  if (!accessToken) return { ok: false, status: 401 };

  const result = await resolveGuildMembership(
    accessToken,
    session.user.id,
    guildId,
  );
  if (result.status === "invalid-token") return { ok: false, status: 401 };
  if (result.status === "unavailable") return { ok: false, status: 502 };
  if (!result.isMember) return { ok: false, status: 403 };
  return { ok: true, token: accessToken, userId: session.user.id };
}

export function deniedGuildManage(authz: Extract<
  AuthorizeResult,
  { ok: false }
>): NextResponse {
  const messages: Record<401 | 403 | 502, string> = {
    401: "로그인이 필요해요.",
    403: "이 서버를 관리할 권한이 없어요.",
    502: "Discord 상태가 좋지 않아 권한을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  };
  return NextResponse.json({ error: messages[authz.status] }, { status: authz.status });
}

export function deniedGuildMember(authz: Extract<AuthorizeResult, { ok: false }>): NextResponse {
  const messages: Record<401 | 403 | 502, string> = {
    401: "로그인이 필요해요.",
    403: "이 서버의 멤버만 사용할 수 있어요.",
    502: "Discord 상태가 좋지 않아 멤버십을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  };
  return NextResponse.json({ error: messages[authz.status] }, { status: authz.status });
}

export type UserAuthorizeResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 };

export async function authorizeUser(): Promise<UserAuthorizeResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, status: 401 };
  return { ok: true, userId: session.user.id };
}

export async function authorizeDashboardAdmin(): Promise<UserAuthorizeResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, status: 401 };
  if (!isDashboardAdmin(session.user.id)) return { ok: false, status: 403 };
  return { ok: true, userId: session.user.id };
}

export function deniedUser(authz: Extract<UserAuthorizeResult, { ok: false }>): NextResponse {
  const messages: Record<401 | 403, string> = {
    401: "로그인이 필요해요.",
    403: "권한이 없어요.",
  };
  return NextResponse.json({ error: messages[authz.status] }, { status: authz.status });
}
