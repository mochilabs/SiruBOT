/**
 * 카운팅 기능의 공개 표면 — 카운팅 채널 상태(샤드 메모리 + Redis write-behind)예요.
 * Sapphire 리스너는 features/counting/discord 아래에서 스토어가 직접 읽어요.
 * 다른 feature나 core는 이 파일을 통해서만 들어와요.
 */
export { CountingStateStore, countingStateKey, type CountingStateDeps } from './application/countingState.ts';
