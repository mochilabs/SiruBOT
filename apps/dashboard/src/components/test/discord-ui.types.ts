export const DISCORD_COLORS = {
	bg: "#313338",
	sidebar: "#2B2D31",
	servers: "#1E1F22",
	text: "#DBDEE1",
	textMuted: "#949BA4",
	header: "#F2F3F5",
	blurple: "#5865F2",
	green: "#23A559",
	gray: "#4E5058"
} as const;

export type DiscordStep = 0 | 1 | 2 | 3;
// 0: initial, 1: typing, 2: thinking, 3: response
