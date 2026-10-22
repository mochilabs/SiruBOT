/** 플레이리스트 보안 상한 — 유저당 생성 가능한 플레이리스트 수 */
export const MAX_PLAYLISTS_PER_USER = 100;

/** 플레이리스트 보안 상한 — 플레이리스트당 곡 수 */
export const MAX_TRACKS_PER_PLAYLIST = 10_000;

/** 플레이리스트 설명 최대 길이 */
export const MAX_PLAYLIST_DESCRIPTION_LENGTH = 500;

/** 기본 "즐겨찾기" 플레이리스트 이름 — 서버 라우트와 클라이언트 훅이 같은 값으로 구분해요 */
export const FAVORITES_PLAYLIST_NAME = "즐겨찾기";

/** 자동 생성되는 "즐겨찾기" 플레이리스트의 기본 설명 */
export const FAVORITES_PLAYLIST_DESCRIPTION = "즐겨찾기한 음악 목록이에요.";
