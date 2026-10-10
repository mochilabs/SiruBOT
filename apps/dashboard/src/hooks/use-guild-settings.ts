"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

import { ApiError, toApiError, toError } from "@/lib/api-error";
import type { DiscordChannelSummary, DiscordRoleSummary } from "@/types/discord";
import type { GuildSettings } from "@/types/settings";

/** 세션 만료(401) — 재시도로 해결되지 않으니 로그인 성공 후 원래 화면으로 돌아와요 */
function loginHref(callbackUrl: string): string {
	return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

/**
 * 401이면 세션 엔드포인트(catch-all)로 refresh를 쿠키에 반영한 뒤 1회 재시도해요.
 * 라우트 핸들러의 auth()는 refresh 결과를 Set-Cookie로 내보내지 못하므로,
 * 실제 persist는 /api/auth/session이 담당해요(getSessionAccessToken이 방금 발급 토큰을 읽게).
 */
async function fetchWithSessionRetry(url: string, init?: RequestInit): Promise<Response> {
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

async function settingsFetcher(url: string): Promise<GuildSettings> {
	const res = await fetchWithSessionRetry(url, { cache: "no-store" });
	if (!res.ok) throw await toApiError(res, "설정을 불러오지 못했어요.");
	return (await res.json()) as GuildSettings;
}

/** 서버 일반 설정 조회 + 부분 저장 (SWR 캐시는 훅 간 공유돼요) */
export function useGuildSettings(guildId: string) {
	const router = useRouter();
	const { data, error, isLoading, mutate } = useSWR<GuildSettings>(`/api/servers/${guildId}/settings`, settingsFetcher);
	const [saving, setSaving] = useState(false);

	const redirectToLogin = useCallback(() => {
		router.push(loginHref(`/servers/${guildId}`));
	}, [router, guildId]);

	// 세션 만료(401) — 이어지는 요청도 같은 결과라 재시도 대신 다시 로그인으로 보내요
	useEffect(() => {
		if (error instanceof ApiError && error.status === 401) redirectToLogin();
	}, [error, redirectToLogin]);

	const save = useCallback(
		async (patch: Partial<GuildSettings>): Promise<GuildSettings> => {
			setSaving(true);
			try {
				const res = await fetch(`/api/servers/${guildId}/settings`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(patch),
				});
				if (!res.ok) {
					const apiError = await toApiError(res, "설정을 저장하지 못했어요.");
					// 세션 만료 — 실패할 재시도 버튼 대신 로그인으로 안내해요
					if (apiError.status === 401) redirectToLogin();
					throw apiError;
				}
				const next = (await res.json()) as GuildSettings;
				await mutate(next, { revalidate: false });
				return next;
			} finally {
				setSaving(false);
			}
		},
		[guildId, mutate, redirectToLogin],
	);

	const reload = useCallback(() => {
		// bound mutate()는 FETCH/PRELOAD 진행 요청 마커를 지우고 재검증해요 —
		// dedupingInterval(SWRConfig 5000ms)로 실패 직후 "다시 시도"가 묵살되지 않게 해요.
		void mutate();
	}, [mutate]);

	return {
		settings: data ?? null,
		isLoading,
		error: error ? toError(error, "설정을 불러오지 못했어요.") : null,
		saving,
		save,
		reload,
	};
}

/**
 * 설정 패널용 폼 상태 — 로드 시 서버 값을 채우고, 수정 중에는
 * 백그라운드 재검증이 입력을 덮어쓰지 않게 dirty 리포트로 보호해요.
 * `mapSettings`는 모듈 수준 함수로 넘길 것(안정 참조).
 */
export function useSettingsForm<T extends Partial<GuildSettings>>(
	guildId: string,
	mapSettings: (settings: GuildSettings) => T,
) {
	const { settings, isLoading, error, saving, save, reload } = useGuildSettings(guildId);
	const [form, setForm] = useState<T | null>(null);
	const dirtyRef = useRef(false);

	useEffect(() => {
		if (settings && !dirtyRef.current) setForm(mapSettings(settings));
	}, [settings, mapSettings]);

	const patch = useCallback((next: Partial<T>) => {
		dirtyRef.current = true;
		setForm((prev) => (prev ? { ...prev, ...next } : prev));
	}, []);

	const submit = useCallback(async (): Promise<GuildSettings | null> => {
		if (!form) return null;
		const next = await save(form);
		setForm(mapSettings(next));
		dirtyRef.current = false;
		return next;
	}, [form, save, mapSettings]);

	return {
		form,
		isLoading,
		error,
		saving,
		dirty: dirtyRef.current,
		patch,
		submit,
		reload,
	};
}

export interface ChannelsPayload {
	channels: DiscordChannelSummary[];
}

export interface RolesPayload {
	roles: DiscordRoleSummary[];
}

async function discordListFetcher<T>(url: string): Promise<T> {
	const res = await fetchWithSessionRetry(url, { cache: "no-store" });
	if (!res.ok) throw await toApiError(res, "목록을 불러오지 못했어요.");
	return (await res.json()) as T;
}

/** Discord 채널 목록 — 조건부 키로 필요한 패널만 요청해요 */
export function useGuildChannels(guildId: string, enabled = true) {
	const router = useRouter();
	const { data, error, isLoading, mutate } = useSWR<ChannelsPayload>(
		enabled ? `/api/servers/${guildId}/channels` : null,
		discordListFetcher<ChannelsPayload>,
	);

	// 세션 만료(401) — "다시 시도"로는 절대 성공하지 않으니 로그인 페이지로 보내요
	useEffect(() => {
		if (error instanceof ApiError && error.status === 401) {
			router.push(loginHref(`/servers/${guildId}`));
		}
	}, [error, guildId, router]);

	return {
		channels: data?.channels ?? null,
		isLoading,
		error: error ? toError(error, "채널 목록을 불러오지 못했어요.") : null,
		// dedupingInterval 우회: mutate 재검증은 진행 요청 마커를 삭제해 즉시 재요청돼요 (위 useGuildSettings 주석 참고)
		reload: () => void mutate(),
	};
}

/** Discord 역할 목록 */
export function useGuildRoles(guildId: string, enabled = true) {
	const router = useRouter();
	const { data, error, isLoading, mutate } = useSWR<RolesPayload>(
		enabled ? `/api/servers/${guildId}/roles` : null,
		discordListFetcher<RolesPayload>,
	);

	// 세션 만료(401) — 채널 목록과 같은 흐름으로 로그인 페이지로 보내요
	useEffect(() => {
		if (error instanceof ApiError && error.status === 401) {
			router.push(loginHref(`/servers/${guildId}`));
		}
	}, [error, guildId, router]);

	return {
		roles: data?.roles ?? null,
		isLoading,
		error: error ? toError(error, "역할 목록을 불러오지 못했어요.") : null,
		// dedupingInterval 우회: mutate 재검증은 진행 요청 마커를 삭제해 즉시 재요청돼요
		reload: () => void mutate(),
	};
}
