/**
 * Sapphire 피스(commands/listeners/interaction-handlers/preconditions)를 읽는 루트 목록.
 *
 * `src/` 기준 상대 경로예요. 각 루트 바로 아래의 `commands/`, `listeners/`, `interaction-handlers/`, `preconditions/`만 스토어가 읽어요.
 * 부팅(core/bootstrap.ts)과 피스 인벤토리 테스트(core/pieceInventory.test.ts)가 이 상수 하나를 같이 써서 서로 어긋나지 않아요.
 * 등록 순서가 곧 로드 순서예요 (Music -> discord(src/discord, 공통 셸) -> bot-profile·counting·embed-fix·user-data -> 기능 폴더(Games, Tickets, ..., AiChat, Tts)).
 * bot-profile·counting·embed-fix·user-data는 예전에 modules/general(지금의 src/discord) 안에 있던 피스라 src/discord 바로 뒤에 둬서 로드 순서를 유지해요.
 */
export const PIECE_ROOTS = [
	'features/music/discord',
	'discord',
	'features/bot-profile/discord',
	'features/counting/discord',
	'features/embed-fix/discord',
	'features/user-data/discord',
	'features/games/discord',
	'features/tickets/discord',
	'features/role-panels/discord',
	'features/temp-voice/discord',
	'features/custom-commands/discord',
	'features/greeting/discord',
	'features/ai-chat/discord',
	'features/tts/discord'
] as const;
