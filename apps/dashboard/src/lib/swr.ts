"use client";

import { useSession } from "next-auth/react";
import useSWR, { type Fetcher, type SWRResponse } from "swr";

import { useSessionExpiredRedirect } from "@/hooks/use-session-redirect";
import { ApiError, toApiError } from "@/lib/api-error";

// Route handlers cannot Set-Cookie on auth(); hit /api/auth/session so refreshed cookies persist.
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

export function createApiFetcher<T>(fallbackMessage: string, options?: { sessionRetry?: boolean }): (url: string) => Promise<T> {
	return async (url: string) => {
		const res = options?.sessionRetry
			? await fetchWithSessionRetry(url, { cache: "no-store" })
			: await fetch(url, { cache: "no-store" });
		if (!res.ok) throw await toApiError(res, fallbackMessage);
		return (await res.json()) as T;
	};
}

export function useAuthedSWR<T>(key: string | null, callbackUrl: string): SWRResponse<T> {
	const { status } = useSession();
	useSessionExpiredRedirect(status === "unauthenticated", callbackUrl);
	return useSWR<T>(status === "authenticated" ? key : null);
}

export function useGuildResource<T>(
	guildId: string,
	path: string,
	options: { fetcher: Fetcher<T, string>; enabled?: boolean; refreshInterval?: number | ((latest?: T) => number) },
): SWRResponse<T> & { guildUrl: string; redirectToLogin: () => void } {
	const { fetcher, enabled = true, refreshInterval } = options;
	const guildUrl = `/api/servers/${guildId}${path}`;
	const swr = useSWR<T>(enabled ? guildUrl : null, fetcher, refreshInterval !== undefined ? { refreshInterval } : undefined);

	const redirectToLogin = useSessionExpiredRedirect(swr.error instanceof ApiError && swr.error.status === 401, `/servers/${guildId}`);

	return { ...swr, guildUrl, redirectToLogin };
}
