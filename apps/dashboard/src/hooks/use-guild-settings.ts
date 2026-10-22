"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { toApiError, toError } from "@/lib/api-error";
import { createApiFetcher, useGuildResource } from "@/lib/swr";
import type { DiscordChannelSummary, DiscordRoleSummary } from "@/types/discord";
import type { GuildSettings } from "@/types/settings";

/** 설정 목록 fetcher — 401이면 세션 갱신 후 한 번만 재시도하는 공용 계약 (lib/swr) */
const settingsFetcher = createApiFetcher<GuildSettings>("설정을 불러오지 못했어요.", { sessionRetry: true });

/** 서버 일반 설정 조회 + 부분 저장 (SWR 캐시는 훅 간 공유돼요) */
export function useGuildSettings(guildId: string) {
	const { data, error, isLoading, mutate, guildUrl, redirectToLogin } = useGuildResource<GuildSettings>(guildId, "/settings", {
		fetcher: settingsFetcher,
	});
	const [saving, setSaving] = useState(false);

	const save = useCallback(
		async (patch: Partial<GuildSettings>): Promise<GuildSettings> => {
			setSaving(true);
			try {
				const res = await fetch(guildUrl, {
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
		[guildUrl, mutate, redirectToLogin],
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
	const baselineRef = useRef<T | null>(null);
	const formRef = useRef<T | null>(null);
	const pendingRef = useRef<Promise<GuildSettings | null> | null>(null);

	useEffect(() => {
		if (settings && !dirtyRef.current && !pendingRef.current) {
			const next = mapSettings(settings);
			baselineRef.current = next;
			formRef.current = next;
			setForm(next);
		}
	}, [settings, mapSettings]);

	const patch = useCallback((next: Partial<T>) => {
		if (!formRef.current || !baselineRef.current || pendingRef.current) return;
		const updated = { ...formRef.current, ...next };
		const baseline = baselineRef.current;
		dirtyRef.current = (Object.keys(updated) as (keyof T)[]).some((key) => {
			const value = updated[key];
			const saved = baseline[key];
			return Array.isArray(value) && Array.isArray(saved)
				? value.length !== saved.length || value.some((item, index) => item !== saved[index])
				: value !== saved;
		});
		formRef.current = updated;
		setForm(updated);
	}, []);

	const submit = useCallback((): Promise<GuildSettings | null> => {
		if (pendingRef.current) return pendingRef.current;
		if (!formRef.current) return Promise.resolve(null);
		const request = save(formRef.current).then((next) => {
			const saved = mapSettings(next);
			baselineRef.current = saved;
			formRef.current = saved;
			dirtyRef.current = false;
			setForm(saved);
			return next;
		}).finally(() => {
			pendingRef.current = null;
		});
		pendingRef.current = request;
		return request;
	}, [save, mapSettings]);

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

const channelsFetcher = createApiFetcher<ChannelsPayload>("목록을 불러오지 못했어요.", { sessionRetry: true });
const rolesFetcher = createApiFetcher<RolesPayload>("목록을 불러오지 못했어요.", { sessionRetry: true });

/** Discord 채널 목록 — 조건부 키로 필요한 패널만 요청해요 */
export function useGuildChannels(guildId: string, enabled = true) {
	const { data, error, isLoading, mutate } = useGuildResource<ChannelsPayload>(guildId, "/channels", { enabled, fetcher: channelsFetcher });

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
	const { data, error, isLoading, mutate } = useGuildResource<RolesPayload>(guildId, "/roles", { enabled, fetcher: rolesFetcher });

	return {
		roles: data?.roles ?? null,
		isLoading,
		error: error ? toError(error, "역할 목록을 불러오지 못했어요.") : null,
		// dedupingInterval 우회: mutate 재검증은 진행 요청 마커를 삭제해 즉시 재요청돼요
		reload: () => void mutate(),
	};
}
