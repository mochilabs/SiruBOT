/**
 * 채팅 유틸리티 기능의 공용 계약 — 이모지 확대·메시지 인용·임베드 복구·카운팅 채널 (봇·대시보드가 함께 써요).
 *
 * 봇의 general/message 리스너들은 이 모듈의 순수 함수로만 메시지를 판정해요 (DB·Discord API 접근 없음).
 * 대시보드는 EMBED_FIX_SITES·normalizeEmbedFixSites 계약을 그대로 재사용해요.
 * 임베드 복구 프로바이더(kkinstagram 등)는 외부 서비스라 불안정할 수 있어요 — 도메인은 상수로 두고 교체할 수 있게 해요.
 * X 메타데이터는 FxEmbed 공개 API(api.fxtwitter.com)에서 가져와요. data-api /v1/embed-fix/metadata 라우트와
 * 봇 embedFixGateway는 이 모듈의 요청/응답 스키마를 공유해요.
 *
 * 구현은 도메인별 모듈(chatTools/)로 나뉘고, 이 파일은 기존 import 경로
 * (`@sirubot/utils` 배럴 · `@sirubot/utils/chatTools` 서브패스)를 유지하는 재수출 셸이에요.
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
