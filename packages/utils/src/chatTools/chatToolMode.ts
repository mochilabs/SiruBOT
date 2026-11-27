export const CHAT_TOOL_MODES = ['all', 'channels', 'off'] as const;

export type ChatToolMode = (typeof CHAT_TOOL_MODES)[number];

export function normalizeChatToolMode(value: string | null | undefined): ChatToolMode {
	return value && (CHAT_TOOL_MODES as readonly string[]).includes(value) ? (value as ChatToolMode) : 'off';
}
