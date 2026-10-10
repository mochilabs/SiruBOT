/** 봇 프로필(길드 닉네임·아바타) 상태 — data-api botProfileHub 페이로드 계약이에요 */
export interface BotProfileState {
  guildId: string;
  /** 현재 길드 닉네임 — null이면 사용자명으로 표시 중이에요 */
  nickname: string | null;
  /** 봇 사용자명 — 닉네임 초기화 시 표시될 기본 이름이에요 */
  username: string;
  /** 길드 전용 아바타 URL — 설정 안 됐으면 null이에요 */
  guildAvatarUrl: string | null;
  /** 전역(앱) 아바타 URL이에요 */
  globalAvatarUrl: string | null;
  /** 닉네임 변경 권한(CHANGE_NICKNAME 또는 MANAGE_NICKNAMES) 보유여부예요 */
  canChangeNickname: boolean;
  /** 봇의 마지막 적용 시도 결과이에요 */
  lastApply: { ok: boolean; error: string | null; at: number } | null;
  updatedAt: number;
  /** data-api 최종 갱신 기준 밀리초 — 60초 넘으면 stale */
  ageMs: number;
  stale: boolean;
}

export interface BotProfileResponse {
  profile: BotProfileState | null;
  hub: { guilds: number; subscribed: boolean; staleMs: number };
}

/** 패치 요청 페이로드 — 대시보드 route가 data-api로 전달해요 */
export interface BotProfilePatch {
  guildId: string;
  /** undefined = 변경 없음 / string = 설정 / null 및 빈 문자열 = 사용자명으로 초기화 */
  nickname?: string | null;
  /** data URI (data:image/*;base64,...) 또는 null = 길드 아바타 초기화 */
  avatar?: string | null;
}