/**
 * 임베드 복구 기능의 공개 표면 — data-api 메타데이터 게이트웨이예요.
 * Sapphire 리스너(메시지 링크 치환)는 features/embed-fix/discord 아래에서 스토어가 직접 읽어요.
 * 다른 feature나 core는 이 파일을 통해서만 들어와요.
 */
export { fetchEmbedFixMetadata, type EmbedFixGatewayDeps } from './application/embedFixGateway.ts';
