/**
 * 음악 플레이어 수치 한도 — 봇 제어 유스케이스, 웹 플레이어 계약, 대시보드 설정 스키마가 함께 써요.
 * 순수 상수만 두어 클라이언트 번들도 서브패스로 가져다 쓸 수 있어요.
 */

/** 음악 볼륨 하한(%) */
export const MUSIC_VOLUME_MIN = 0;

/** 음악 볼륨 상한(%) — Lavalink 0..150% */
export const MUSIC_VOLUME_MAX = 150;
