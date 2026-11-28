// 등록 순서가 곧 Sapphire 로드 순서예요 (bot-profile·counting·embed-fix·user-data는 src/discord 바로 뒤 유지).
export const PIECE_ROOTS = [
	'features/music/discord',
	'discord',
	'features/bot-profile/discord',
	'features/counting/discord',
	'features/embed-fix/discord',
	'features/user-data/discord',
	'features/games/discord',
	'features/emoji-maker/discord',
	'features/tickets/discord',
	'features/role-panels/discord',
	'features/temp-voice/discord',
	'features/custom-commands/discord',
	'features/greeting/discord',
	'features/starboard/discord',
	'features/scheduled-messages/discord',
	'features/giveaway/discord',
	'features/ai-chat/discord',
	'features/tts/discord'
] as const;
