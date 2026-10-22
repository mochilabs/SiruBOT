"use client";

import { useSession } from "next-auth/react";
import useSWR, { type Fetcher, type SWRResponse } from "swr";

import { useSessionExpiredRedirect } from "@/hooks/use-session-redirect";
import { ApiError, toApiError } from "@/lib/api-error";

/**
 * 클라이언트 SWR 공용 훅·fetcher 모음.
 * 전역 설정(SWRConfig fetcher, Providers.tsx)은 그대로 두고,
 * 세션 게이트·길드 경로·ApiError 계약이 반복되는 화면의 패턴만 여기에 모아요.
 */

/**
 * 401이면 세션 엔드포인트(catch-all)로 refresh를 쿠키에 반영한 뒤 1회 재시도해요.
 * 라우트 핸들러의 auth()는 refresh 결과를 Set-Cookie로 내보내지 못하므로,
 * 실제 persist는 /api/auth/session이 담당해요(getSessionAccessToken이 방금 발급 토큰을 읽게).
 */
export async function fetchWithSessionRetry(url: string, init?: RequestInit): Promise<Response> {
	const res = await fetch(url, init);
	if (res.status !== 401) return res;
	try {
		const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
		const session = sessionRes.ok ? await sessionRes.json() : null;
		if (!session?.user?.id) return res;
	} catch {
		return res;
	}
	return fetch(url, init);
}

/**
 * JSON GET 표준 fetcher 팩토리 — 실패 본문의 서버 메시지(error)를 담은 ApiError를 던져요.
 * `sessionRetry: true`면 401에서 세션 갱신 후 한 번만 다시 요청해요(설정·채널·역할 목록 계약).
 * 반환을 `Promise<T>`로 좁게 선언해 SWR의 `Fetcher<T, string>`에는 그대로 대입 가능해요.
 */
export function createApiFetcher<T>(fallbackMessage: string, options?: { sessionRetry?: boolean }): (url: string) => Promise<T> {
	return async (url: string) => {
		const res = options?.sessionRetry
			? await fetchWithSessionRetry(url, { cache: "no-store" })
			: await fetch(url, { cache: "no-store" });
		if (!res.ok) throw await toApiError(res, fallbackMessage);
		return (await res.json()) as T;
	};
}

/**
 * 세션 게이트 SWR — 로그인(authenticated) 확인 전에는 키를 닫아 익명 요청을 막고,
 * 세션 만료(unauthenticated)면 로그인 후 이 화면으로 돌아오도록 보내요.
 */
export function useAuthedSWR<T>(key: string | null, callbackUrl: string): SWRResponse<T> {
	const { status } = useSession();
	useSessionExpiredRedirect(status === "unauthenticated", callbackUrl);
	return useSWR<T>(status === "authenticated" ? key : null);
}

/**
 * 길드 리소스 공통 훅 — `/api/servers/:id<path>`를 ApiError fetcher로 읽어오고,
 * 401(세션 만료)이면 "다시 시도"로는 절대 성공하지 않으니 로그인 페이지로 보내요.
 * `enabled: false`면 키를 닫아 필요한 패널만 요청해요.
 * `refreshInterval`은 SSE 폴백 폴링처럼 주기 재검증이 필요한 화면에서만 넘겨요.
 * `guildUrl`은 실제 SWR 키 그대로 돌려주니 쓰기 요청도 같은 문자열에서 파생시켜요.
 */
export function useGuildResource<T>(
	guildId: string,
	path: string,
	options: { fetcher: Fetcher<T, string>; enabled?: boolean; refreshInterval?: number },
): SWRResponse<T> & { guildUrl: string; redirectToLogin: () => void } {
	const { fetcher, enabled = true, refreshInterval } = options;
	const guildUrl = `/api/servers/${guildId}${path}`;
	const swr = useSWR<T>(enabled ? guildUrl : null, fetcher, refreshInterval !== undefined ? { refreshInterval } : undefined);

	// 세션 만료(401) — 이어지는 요청도 같은 결과라 재시도 대신 다시 로그인으로 보내요
	const redirectToLogin = useSessionExpiredRedirect(swr.error instanceof ApiError && swr.error.status === 401, `/servers/${guildId}`);

	return { ...swr, guildUrl, redirectToLogin };
}
