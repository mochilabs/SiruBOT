/**
 * 클라이언트("use client") 번들에서 안전하게 임포트할 수 있는 상수 배럴이에요.
 *
 * 이 파일은 node 전용 모듈(version/child_process, appEmoji/node:fs, youtube/undici,
 * redisSubscriber/@redis/client, logger/tslog, embed/discord.js)을 절대 re-export하지 않아요 —
 * 대시보드 next.config.ts에 discord.js 정적 해석으로 빌드가 깨진 선례가 있어요.
 * 새 모듈을 여기에 넣을 때는 "순수 값·zod 스키마만"인지 확인하세요.
 */
export { BOT_NAME, DEFAULT_COLOR, DEFAULT_COLOR_HEX, VOICE_CHANNEL_REQUIRED_MESSAGE, WARN_COLOR } from './constants.js';
