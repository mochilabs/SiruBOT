"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";

import { toApiError, toError } from "@/lib/api-error";
import type { BotProfileResponse } from "@/types/bot-profile";

async function profileFetcher(url: string): Promise<BotProfileResponse> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw await toApiError(res, "봇 프로필 상태를 불러오지 못했어요.");
  return (await res.json()) as BotProfileResponse;
}

/**
 * 봇 프로필 상태 조회 + 저장 (multipart PATCH).
 * 저장은 봇이 Redis로 적용을 받아 비동기로 반영해요 — 성공 직후 잠깐 뒤 재조회하면
 * 적용된 상태를 받아요. 실패도 상태 퍼블리시로 돌아와 lastApply로 보여줘요.
 */
export function useBotProfile(guildId: string) {
  const { data, error, isLoading, mutate } = useSWR<BotProfileResponse>(
    `/api/servers/${guildId}/bot-profile`,
    profileFetcher,
    { revalidateOnFocus: false },
  );
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (form: FormData): Promise<void> => {
      setSaving(true);
      try {
        const res = await fetch(`/api/servers/${guildId}/bot-profile`, {
          method: "PATCH",
          body: form,
        });
        if (!res.ok) throw await toApiError(res, "프로필을 저장하지 못했어요.");
        await res.json().catch(() => null);
        // 봇이 적용 완료 후 상태를 다시 퍼블리시해요 — 두 번의 지연 재조회로 잡아요.
        setTimeout(() => void mutate(), 1_000);
        setTimeout(() => void mutate(), 3_000);
      } finally {
        setSaving(false);
      }
    },
    [guildId, mutate],
  );

  const reload = useCallback(() => {
    // bound mutate()는 실패 직후 재시도가 묵살되지 않게 진행 요청 마커를 지우고 재검증해요.
    void mutate();
  }, [mutate]);

  return {
    profile: data?.profile ?? null,
    hub: data?.hub ?? null,
    isLoading,
    error: error ? toError(error, "봇 프로필 상태를 불러오지 못했어요.") : null,
    saving,
    save,
    reload,
  };
}