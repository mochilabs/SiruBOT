/** webhookId/webhookToken은 절대 노출하지 않음 */
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
  webhookName: string | null;
  webhookAvatarUrl: string | null;
  showThumbnail: boolean;
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