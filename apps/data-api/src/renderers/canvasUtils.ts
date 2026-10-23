/**
 * skia-canvas 공용 헬퍼 — nowPlayingCard / greetingCard / ohaasaCard / 프로필 카드 프리셋(dark·ticket)에서 함께 써요.
 * 구현은 ./canvas/ 하위 모듈로 분리돼 있고, 이 파일은 소비자 계약(모듈 경로·export 목록)을 유지하는 퍼사드예요.
 *
 * | 모듈 | 책임 |
 * |---|---|
 * | canvas/fonts.ts | Pretendard·Twemoji 1회 등록 + Path2D 생성자 싱글턴 |
 * | canvas/images.ts | 이미지 fetch 허용 호스트 allowlist(SSRF 방지)와 로딩 |
 * | canvas/shapes.ts | 텍스트 생략·시드 난수·시계 포맷·색 변환(hexToRgba 재수출)·원형 이미지 클립 |
 * | canvas/icons.ts | lucide 아이콘 경로 DB와 drawIcon 드로잉 |
 */
export { ensureKoreanFont } from './canvas/fonts.ts';
export { isAllowedImageUrl, loadImageAllowed } from './canvas/images.ts';
export { drawCircleImage, formatClock, hashString, hexToRgba, makeRng, truncate } from './canvas/shapes.ts';
export { drawIcon, type IconName } from './canvas/icons.ts';
