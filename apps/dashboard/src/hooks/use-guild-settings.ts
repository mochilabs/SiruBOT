"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { toApiError, toError } from "@/lib/api-error";
import { createApiFetcher, useGuildResource } from "@/lib/swr";
import type { DiscordChannelSummary, DiscordRoleSummary } from "@/types/discord";
import type { GuildSettings } from "@/types/settings";

const settingsFetcher = createApiFetcher<GuildSettings>("설정을 불러오지 못했어요.", { sessionRetry: true });

export function useGuildSettings(guildId: string, enabled = true) {
	const { data, error, isLoading, mutate, guildUrl, redirectToLogin } = useGuildResource<GuildSettings>(guildId, "/settings", {
		enabled,
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
		// bound mutate()로 dedupingInterval 내 재시도 묵살 방지
		void mutate();
	}, [mutate]);

	const syncCache = useCallback(
		(fields: Partial<GuildSettings>) => {
			void mutate((prev) => (prev ? { ...prev, ...fields } : prev), { revalidate: false });
		},
		[mutate],
	);

	return {
		settings: data ?? null,
		isLoading,
		error: error ? toError(error, "설정을 불러오지 못했어요.") : null,
		saving,
		save,
		syncCache,
		reload,
	};
}

/** mapSettings는 안정 참조(모듈 수준 함수)로 전달해야 함 */
export function useSettingsForm<T extends Partial<GuildSettings>>(
	guildId: string,
	mapSettings: (settings: GuildSettings) => T,
) {
	const { settings, isLoading, error, saving, save, syncCache, reload } = useGuildSettings(guildId);
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

	const commitExternal = useCallback(
		(fields: Partial<T>) => {
			if (!formRef.current || !baselineRef.current) return;
			const nextBaseline = { ...baselineRef.current, ...fields };
			const updated = { ...formRef.current, ...fields };
			baselineRef.current = nextBaseline;
			formRef.current = updated;
			dirtyRef.current = (Object.keys(updated) as (keyof T)[]).some((key) => {
				const value = updated[key];
				const saved = nextBaseline[key];
				return Array.isArray(value) && Array.isArray(saved)
					? value.length !== saved.length || value.some((item, index) => item !== saved[index])
					: value !== saved;
			});
			setForm(updated);
			syncCache(fields);
		},
		[syncCache],
	);

	return {
		form,
		isLoading,
		error,
		saving,
		dirty: dirtyRef.current,
		patch,
		commitExternal,
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

export function useGuildChannels(guildId: string, enabled = true) {
	const { data, error, isLoading, mutate } = useGuildResource<ChannelsPayload>(guildId, "/channels", { enabled, fetcher: channelsFetcher });

	return {
		channels: data?.channels ?? null,
		isLoading,
		error: error ? toError(error, "채널 목록을 불러오지 못했어요.") : null,
		reload: () => void mutate(),
	};
}

export function useGuildRoles(guildId: string, enabled = true) {
	const { data, error, isLoading, mutate } = useGuildResource<RolesPayload>(guildId, "/roles", { enabled, fetcher: rolesFetcher });

	return {
		roles: data?.roles ?? null,
		isLoading,
		error: error ? toError(error, "역할 목록을 불러오지 못했어요.") : null,
		reload: () => void mutate(),
	};
}
