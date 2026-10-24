/**
 * framer-motion duration 토큰 — DESIGN.md §7.4 근사 매핑.
 * CSS `--motion-fast/base/slow`(200/300/500ms)와 1:1로 대응하는 초 단위 값이에요.
 * 인라인 `duration: 0.x` 리터럴 대신 이 상수를 사용해 P6(모션 토큰화)를 지켜요.
 */
export const motionFast = 0.2;
export const motionBase = 0.3;
export const motionSlow = 0.5;

/** cubic-bezier(0.16, 1, 0.3, 1) — CSS `--ease-out-expo`와 대응하는 framer easing 값 */
export const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];
