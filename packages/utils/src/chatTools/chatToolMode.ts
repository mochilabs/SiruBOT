/**
 * 채팅 유틸 모드(all / channels / off) 단일 계약 — 이모지 확대·메시지 인용·임베드 복구가 공유해요.
 * 봇(guildService)과 대시보드(guildSettingsSchema)가 같은 상수·정규화기를 쓰므로 한쪽 수정이
 * 다른 쪽 검증과 어긋나지 않아요.
 *
 * 채널 목록 on/off 판정 규칙은 봇 guildService의 isChannelToggleEnabled가, AI 채팅·TTS 모드는
 * 기본값이 각각 'all'·'off'로 달라서 여기에 없어요.
 */
export const CHAT_TOOL_MODES = ['all', 'channels', 'off'] as const;

export type ChatToolMode = (typeof CHAT_TOOL_MODES)[number];

/** DB에 잘못된 모드 값이 들어와도 안전하게 기본값('off')으로 되돌려요 — 채팅 유틸은 명시적으로 켜야 해요 */
export function normalizeChatToolMode(value: string | null | undefined): ChatToolMode {
	return value && (CHAT_TOOL_MODES as readonly string[]).includes(value) ? (value as ChatToolMode) : 'off';
}
