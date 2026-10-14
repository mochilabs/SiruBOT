"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 세션 만료 리다이렉트 — 재시도로 해결되지 않는 오류이니 로그인 후 원래 화면으로 돌아오게 해요.
 * 로그인 URL은 navbar와 같은 `/api/auth/signin?callbackUrl=` 규약을 써요.
 * 돌려주는 redirectToLogin은 저장·전송 같은 수동 요청의 401 처리에도 그대로 써요.
 */
export function useSessionExpiredRedirect(expired: boolean, callbackUrl: string): () => void {
	const router = useRouter();
	const redirectToLogin = useCallback(() => {
		router.push(`/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
	}, [router, callbackUrl]);

	useEffect(() => {
		if (expired) redirectToLogin();
	}, [expired, redirectToLogin]);

	return redirectToLogin;
}