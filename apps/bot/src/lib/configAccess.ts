/**
 * Config 접근자 재노출 — modules/*는 core/를 import할 수 없어서(architecture.test.ts의 modules -> core 래칫) lib 경유로 열어요.
 * 구현·문서는 core/config.ts가 단일 원본이에요. features/*\/application/ 코드는 이걸 쓰지 말고 deps로 값을 받아요.
 */
export { getConfig } from '../core/config.ts';
