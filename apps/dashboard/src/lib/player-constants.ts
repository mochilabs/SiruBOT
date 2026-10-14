/**
 * 플레이어 컨트롤러 상수 — 클라이언트 컴포넌트도 가져다 쓰는 값이니 서버 전용 모듈
 * (data-api 등)에 두지 않아요. 봇 /volume 명령·웹 컨트롤러 검증(packages/utils
 * playerWeb.ts)·설정 스키마가 같은 0~150 계약을 공유해요.
 */

/** 볼륨 상한 — 봇 /volume 명령 계약(0~150)과 같아요 */
export const PLAYER_VOLUME_MAX = 150;