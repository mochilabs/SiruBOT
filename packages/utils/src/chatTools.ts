/**
 * 채팅 유틸리티 기능의 공용 계약 — 이모지 확대·메시지 인용·임베드 복구·카운팅 채널 (봇·대시보드가 함께 써요).
 *
 * 구현은 도메인별 모듈(chatTools/)로 나뉘고, 이 파일은 기존 import 경로
 * (`@sirubot/utils` 배럴 · `@sirubot/utils/chatTools` 서브패스)를 유지하는 재수출 셸이에요.
 * 각 모듈의 상세 계약은 해당 모듈 헤더 문서를 참고해요.
 * - chatTools/emoji.ts — 커스텀 이모지 확대
 * - chatTools/messageLink.ts — 디스코드 메시지 링크 인용
 * - chatTools/embedFix.ts — 임베드 복구 링크 파싱·도메인 스왑·게이트웨이 스키마
 * - chatTools/og.ts — OG 메타(BOOTH 포함)·FxEmbed 트윗 메타데이터 파싱
 * - chatTools/counting.ts — 카운팅 채널 판정
 */
export * from './chatTools/chatToolMode.js';
export * from './chatTools/emoji.js';
export * from './chatTools/messageLink.js';
export * from './chatTools/embedFix.js';
export * from './chatTools/og.js';
export * from './chatTools/counting.js';
