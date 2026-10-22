/** 소셜 알림 구독 — notifier가 내려주는 공개 형태예요 (webhookId/webhookToken은 절대 내려오지 않아요). */
export type SocialPlatform = "youtube" | "chzzk" | "twitch";

export type SocialSubscriptionStatus = "active" | "failed" | "disabled";

export interface SocialSubscription {
  id: string;
  guildId: string;
  platform: SocialPlatform;
  sourcePlatformId: string;
  sourceName: string;
  targetChannelId: string;
  messageTemplate: string | null;
  /** 웹훅 표시명 오버라이드 — null이면 웹훅 기본 이름 */
  webhookName: string | null;
  /** 웹훅 프로필 사진 오버라이드 — null이면 웹훅 기본 아바타 */
  webhookAvatarUrl: string | null;
  status: SocialSubscriptionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SocialSubscriptionsResponse {
  subscriptions: SocialSubscription[];
}

export interface SocialSubscriptionResponse {
  subscription: SocialSubscription;
}

/** 치지직 채널 요약 — 검색 결과와 프로필이 같은 모양을 공유해요. */
export interface ChzzkChannelSummary {
  channelId: string;
  channelName: string;
  channelImageUrl: string | null;
  verifiedMark: boolean | null;
  channelDescription: string | null;
  followerCount: number | null;
  openLive: boolean | null;
  liveTitle: string | null;
}

export interface ChzzkSearchResponse {
  channels: ChzzkChannelSummary[];
}

export interface ChzzkProfileResponse {
  channel: ChzzkChannelSummary | null;
}

export interface YouTubeResolveResponse {
  channelId: string;
  channelName: string | null;
}

export interface TwitchResolveResponse {
  id: string;
  login: string;
  displayName: string;
}