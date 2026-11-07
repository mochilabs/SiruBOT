/**
 * 서버 대시보드 탭 목록 — 아이콘 없는 순수 데이터예요.
 * server-dashboard.tsx가 아이콘을 붙여 렌더링하고,
 * servers/[id]/loading.tsx 스켈레톤이 같은 목록으로 탭 수를 따라가요 (9/7 하드코딩 방지).
 */
export const SERVER_TABS = [
  { key: "music", label: "음악", group: "music" },
  { key: "player-live", label: "라이브", group: "music" },
  { key: "mixer", label: "오디오 엔진", group: "music" },
  { key: "stats", label: "통계", group: "music" },
  { key: "ai", label: "AI 채팅", group: "chat" },
  { key: "custom-commands", label: "커스텀 명령어", group: "chat" },
  { key: "chat-tools", label: "채팅 유틸", group: "chat" },
  { key: "greeting", label: "멤버", group: "community" },
  { key: "ticket", label: "티켓", group: "community" },
  { key: "social", label: "소셜 알림", group: "community" },
  { key: "jtc", label: "임시 음성", group: "community" },
  { key: "profile", label: "봇 프로필", group: "style" },
  { key: "assets", label: "에셋", group: "style" },
  { key: "channels", label: "채널·권한", group: "server" },
] as const;

/** 사이드바·모바일 내비게이션의 그룹 — SERVER_TABS가 그룹 순서대로 정렬돼 있어요 */
export const SERVER_TAB_GROUPS = {
  music: "음악",
  chat: "채팅",
  community: "커뮤니티",
  style: "꾸미기",
  server: "서버",
} as const;
export type ServerTabGroup = keyof typeof SERVER_TAB_GROUPS;
export type ServerTabKey = (typeof SERVER_TABS)[number]["key"];