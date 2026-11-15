import { MUSIC_VOLUME_MAX } from "@sirubot/utils/playerLimits";

/**
 * 플레이어 컨트롤러 상수 — 클라이언트 컴포넌트도 가져다 쓰는 값이니 서버 전용 모듈
 * (data-api 등)에 두지 않아요. 볼륨 한도의 단일 원본은 @sirubot/utils/playerLimits이고,
 * 봇 제어 유스케이스·웹 컨트롤러 검증(packages/utils playerWeb.ts)·설정 스키마가 같은 값을 공유해요.
 */

/** 볼륨 상한 — 봇 음악 볼륨 한도(MUSIC_VOLUME_MAX)와 같아요 */
export const PLAYER_VOLUME_MAX = MUSIC_VOLUME_MAX;
