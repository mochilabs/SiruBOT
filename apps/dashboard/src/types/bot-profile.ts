export interface BotProfileState {
  guildId: string;
  nickname: string | null;
  username: string;
  guildAvatarUrl: string | null;
  guildBannerUrl: string | null;
  globalAvatarUrl: string | null;
  canChangeNickname: boolean;
  lastApply: { ok: boolean; error: string | null; at: number } | null;
  updatedAt: number;
}

export interface BotProfileResponse {
  profile: BotProfileState | null;
  hub: { guilds: number; subscribed: boolean };
  refreshFailed: boolean;
}

export interface BotProfilePatch {
  guildId: string;
  /** undefined = 변경 없음, null/빈 문자열 = 초기화 */
  nickname?: string | null;
  avatar?: string | null;
  /** 16:5 비율 data URI 또는 null(초기화) */
  banner?: string | null;
}
