"use client";

import { useCallback, useState } from "react";

import { toApiError, toError } from "@/lib/api-error";
import { createApiFetcher, useGuildResource } from "@/lib/swr";
import type { BotProfileResponse } from "@/types/bot-profile";

const profileFetcher = createApiFetcher<BotProfileResponse>("봇 프로필 상태를 불러오지 못했어요.");

export function useBotProfile(guildId: string) {
  const { data, error, isLoading, mutate, guildUrl, redirectToLogin } = useGuildResource<BotProfileResponse>(guildId, "/bot-profile", {
    fetcher: profileFetcher,
  });
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (form: FormData): Promise<void> => {
      setSaving(true);
      try {
        const res = await fetch(guildUrl, {
          method: "PATCH",
          body: form,
        });
        if (!res.ok) {
          const apiError = await toApiError(res, "프로필을 저장하지 못했어요.");
          if (apiError.status === 401) redirectToLogin();
          throw apiError;
        }
        await res.json().catch(() => null);
        // 봇이 Redis로 비동기 적용 후 상태를 재발행하므로 지연 재조회
        setTimeout(() => void mutate(), 1_000);
        setTimeout(() => void mutate(), 3_000);
      } finally {
        setSaving(false);
      }
    },
    [guildUrl, mutate, redirectToLogin],
  );

  const reload = useCallback(() => {
    void mutate();
  }, [mutate]);

  return {
    profile: data?.profile ?? null,
    hub: data?.hub ?? null,
    refreshFailed: data?.refreshFailed ?? false,
    isLoading,
    error: error ? toError(error, "봇 프로필 상태를 불러오지 못했어요.") : null,
    saving,
    save,
    reload,
  };
}
