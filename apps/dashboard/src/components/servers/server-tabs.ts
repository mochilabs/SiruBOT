/**
 * 서버 대시보드 탭 목록 — 아이콘 없는 순수 데이터예요.
 * server-dashboard.tsx가 아이콘을 붙여 렌더링하고,
 * servers/[id]/loading.tsx 스켈레톤이 같은 목록으로 탭 수를 따라가요 (9/7 하드코딩 방지).
 */
export const SERVER_TABS = [
  { key: "ai", label: "AI 채팅" },
  { key: "custom-commands", label: "커스텀 명령어" },
  { key: "assets", label: "에셋" },
  { key: "profile", label: "봇 프로필" },
  { key: "music", label: "음악" },
  { key: "player-live", label: "라이브" },
  { key: "stats", label: "통계" },
  { key: "channels", label: "채널·권한" },
  { key: "chat-tools", label: "채팅 유틸" },
  { key: "jtc", label: "임시 음성" },
  { key: "mixer", label: "오디오 엔진" },
  { key: "social", label: "소셜 알림" },
  { key: "greeting", label: "멤버" },
  { key: "ticket", label: "티켓" },
] as const;
export type ServerTabKey = (typeof SERVER_TABS)[number]["key"];