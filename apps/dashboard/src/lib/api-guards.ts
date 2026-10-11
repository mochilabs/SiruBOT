import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { resolveCanManage, resolveGuildMembership } from "@/lib/guild-permissions";
import { getSessionAccessToken } from "@/lib/session-token";

/** 권한 확인 결과 — unavailable은 Discord 장애(429/5xx/네트워크)라 502로 응답해요 */
export type AuthorizeResult =
  | { ok: true; token: string; userId: string }
  | { ok: false; status: 401 | 403 | 502 };

/**
 * 길드 관리 권한 공용 검증 — 세션 → accessToken → resolveCanManage 3상태 분기.
 * 세션/토큰 없음 → 401, 권한 없음 → 403, Discord 확인 불가 → 502.
 * 항상 token+userId를 반환하니 rate limit의 rateKey에 authz.userId를 쓰면 돼요.
 */
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

/**
 * 길드 멤버 공용 검증 — 관리자가 아니어도 길드 멤버면 통과해요.
 * 실제 제어 권한(DJ 역할)은 봇이 요청자 멤버로 판정해요 — 웹 OAuth로는 알 수 없어요.
 * 세션/토큰 없음 → 401, 멤버 아님 → 403, Discord 확인 불가 → 502.
 */
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

/** AuthorizeResult 실패 상태에 맞는 한국어 응답 — 라우트 진입점에서 바로 반환하세요 */
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

/** 멤버 게이트 실패 응답 — player 페이지의 멤버 전용 라우트에서 써요 */
export function deniedGuildMember(authz: Extract<AuthorizeResult, { ok: false }>): NextResponse {
  const messages: Record<401 | 403 | 502, string> = {
    401: "로그인이 필요해요.",
    403: "이 서버의 멤버만 사용할 수 있어요.",
    502: "Discord 상태가 좋지 않아 멤버십을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  };
  return NextResponse.json({ error: messages[authz.status] }, { status: authz.status });
}