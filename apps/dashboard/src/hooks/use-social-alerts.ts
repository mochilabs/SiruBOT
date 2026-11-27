"use client";

import { toApiError, toError } from "@/lib/api-error";
import { createApiFetcher, useGuildResource } from "@/lib/swr";
import type {
	ChzzkChannelSummary,
	ChzzkProfileResponse,
	ChzzkSearchResponse,
	SocialPlatform,
	SocialSubscription,
	SocialSubscriptionsResponse,
	TwitchResolveResponse,
	YouTubeResolveResponse,
} from "@/types/social";

export interface SocialSubscriptionInput {
	platform: SocialPlatform;
	sourcePlatformId: string;
	sourceName: string;
	targetChannelId: string;
	messageTemplate?: string | null;
	webhookName?: string | null;
	webhookAvatarUrl?: string | null;
	showThumbnail?: boolean;
}

export interface SocialSubscriptionPatch {
	messageTemplate?: string | null;
	status?: "active" | "disabled";
	webhookName?: string | null;
	webhookAvatarUrl?: string | null;
	showThumbnail?: boolean;
}

export type SocialActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const listFetcher = createApiFetcher<SocialSubscriptionsResponse>("알림 구독 목록을 불러오지 못했어요.");

export function useSocialAlerts(guildId: string, enabled = true) {
	const { data, error, isLoading, mutate, guildUrl, redirectToLogin } = useGuildResource<SocialSubscriptionsResponse>(guildId, "/social/subscriptions", {
		enabled,
		fetcher: listFetcher,
	});

	const subscriptions: SocialSubscription[] | null = data?.subscriptions ?? null;

	const failure = async (res: Response, fallback: string): Promise<{ ok: false; error: string }> => {
		const apiError = await toApiError(res, fallback);
		if (apiError.status === 401) redirectToLogin();
		return { ok: false, error: apiError.message };
	};

	const createSubscription = async (
		input: SocialSubscriptionInput,
	): Promise<SocialActionResult<SocialSubscription>> => {
		const res = await fetch(guildUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		});
		if (!res.ok) return failure(res, "알림 구독을 추가하지 못했어요.");
		const payload = (await res.json()) as { subscription: SocialSubscription };
		const current = data?.subscriptions ?? [];
		await mutate({ subscriptions: [payload.subscription, ...current] }, { revalidate: false });
		void mutate();
		return { ok: true, data: payload.subscription };
	};

	const updateSubscription = async (
		subscriptionId: string,
		patch: SocialSubscriptionPatch,
	): Promise<SocialActionResult<SocialSubscription>> => {
		const res = await fetch(`${guildUrl}/${subscriptionId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(patch),
		});
		if (!res.ok) return failure(res, "알림 구독을 수정하지 못했어요.");
		const payload = (await res.json()) as { subscription: SocialSubscription };
		const current = data?.subscriptions ?? [];
		await mutate(
			{ subscriptions: current.map((item) => (item.id === subscriptionId ? payload.subscription : item)) },
			{ revalidate: false },
		);
		void mutate();
		return { ok: true, data: payload.subscription };
	};

	const removeSubscription = async (subscriptionId: string): Promise<SocialActionResult<null>> => {
		const res = await fetch(`${guildUrl}/${subscriptionId}`, {
			method: "DELETE",
		});
		if (!res.ok) return failure(res, "알림 구독을 삭제하지 못했어요.");
		const current = data?.subscriptions ?? [];
		await mutate(
			{ subscriptions: current.filter((item) => item.id !== subscriptionId) },
			{ revalidate: false },
		);
		void mutate();
		return { ok: true, data: null };
	};

	const searchChzzk = async (
		keyword: string,
		offset = 0,
		size = 10,
	): Promise<SocialActionResult<ChzzkChannelSummary[]>> => {
		const query = new URLSearchParams({ keyword, offset: String(offset), size: String(size) });
		const res = await fetch(`/api/servers/${guildId}/social/chzzk/search?${query.toString()}`, {
			cache: "no-store",
		});
		if (!res.ok) return failure(res, "치지직 채널 검색에 실패했어요.");
		const payload = (await res.json()) as ChzzkSearchResponse;
		return { ok: true, data: payload.channels };
	};

	const fetchChzzkProfile = async (
		channelId: string,
	): Promise<SocialActionResult<ChzzkChannelSummary | null>> => {
		const res = await fetch(`/api/servers/${guildId}/social/chzzk/profile`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ channelId }),
		});
		if (!res.ok) return failure(res, "치지직 채널 정보를 불러오지 못했어요.");
		const payload = (await res.json()) as ChzzkProfileResponse;
		return { ok: true, data: payload.channel };
	};

	const resolveYouTube = async (input: string): Promise<SocialActionResult<YouTubeResolveResponse>> => {
		const res = await fetch(`/api/servers/${guildId}/social/youtube/resolve`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ input }),
		});
		if (!res.ok) return failure(res, "유튜브 채널을 확인하지 못했어요.");
		return { ok: true, data: (await res.json()) as YouTubeResolveResponse };
	};

	const resolveTwitch = async (login: string): Promise<SocialActionResult<TwitchResolveResponse>> => {
		const res = await fetch(`/api/servers/${guildId}/social/twitch/resolve`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ login }),
		});
		if (!res.ok) return failure(res, "트위치 사용자를 확인하지 못했어요.");
		return { ok: true, data: (await res.json()) as TwitchResolveResponse };
	};

	return {
		subscriptions,
		isLoading,
		error: error ? toError(error, "알림 구독 목록을 불러오지 못했어요.") : null,
		reload: () => void mutate(),
		createSubscription,
		updateSubscription,
		removeSubscription,
		searchChzzk,
		fetchChzzkProfile,
		resolveYouTube,
		resolveTwitch,
	};
}