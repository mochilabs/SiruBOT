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

/** 구독 추가에 필요한 입력 — 대시보드에서 조립해 POST로 보내요. */
export interface SocialSubscriptionInput {
	platform: SocialPlatform;
	sourcePlatformId: string;
	sourceName: string;
	targetChannelId: string;
	messageTemplate?: string | null;
	/** 웹훅 표시명 — null이면 기본 이름(시루 소셜 알림 — 채널 이름) */
	webhookName?: string | null;
	/** 웹훅 프로필 사진 URL — null이면 웹훅 기본 아바타 */
	webhookAvatarUrl?: string | null;
	/** 라이브 섬네일 표시 — 없으면 기본값(true) */
	showThumbnail?: boolean;
}

export interface SocialSubscriptionPatch {
	messageTemplate?: string | null;
	status?: "active" | "disabled";
	/** 웹훅 표시명 — null이면 기본 표시로 되돌려요 */
	webhookName?: string | null;
	/** 웹훅 프로필 사진 URL — null이면 기본 아바타로 되돌려요 */
	webhookAvatarUrl?: string | null;
	/** 라이브 섬네일 표시 */
	showThumbnail?: boolean;
}

export type SocialActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const listFetcher = createApiFetcher<SocialSubscriptionsResponse>("알림 구독 목록을 불러오지 못했어요.");

/** 소셜 알림 구독 CRUD + 플랫폼별 채널 해석 — data-api → notifier 프록시를 경유해요. */
export function useSocialAlerts(guildId: string, enabled = true) {
	const { data, error, isLoading, mutate, guildUrl, redirectToLogin } = useGuildResource<SocialSubscriptionsResponse>(guildId, "/social/subscriptions", {
		enabled,
		fetcher: listFetcher,
	});

	const subscriptions: SocialSubscription[] | null = data?.subscriptions ?? null;

	/** 실패 응답 — 본문 error(한국어) 우선은 toApiError가 담당하고, status를 잃지 않도록 401은 로그인으로 보내요 (다른 길드 훅과 같은 규율). */
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