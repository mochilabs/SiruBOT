"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

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