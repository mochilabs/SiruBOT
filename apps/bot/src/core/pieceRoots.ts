/**
 * Sapphire 피스(commands/listeners/interaction-handlers/preconditions)를 읽는 루트 목록.
 *
 * `src/` 기준 상대 경로예요. 각 루트 바로 아래의 `commands/`, `listeners/`, `interaction-handlers/`, `preconditions/`만 스토어가 읽어요.
 * 부팅(core/bootstrap.ts)과 피스 인벤토리 테스트(core/pieceInventory.test.ts)가 이 상수 하나를 같이 써서 서로 어긋나지 않아요.
 * 등록 순서가 곧 로드 순서예요 (Audio -> General -> Voice -> Games -> 기능 폴더).
 */
export const PIECE_ROOTS = ['modules/audio', 'modules/general', 'modules/voice', 'modules/games'] as const;
