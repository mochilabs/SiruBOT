/**
 * 색 이모지 — satori는 색 이모지 폰트를 못 그려서, `loadAdditionalAsset('emoji', 글자)`에 Twemoji SVG를 이미지로 넘겨요.
 * 파일 이름 규칙은 Twemoji와 같아요: 코드포인트를 16진수로 `-`로 잇고, ZWJ(200D)가 없는 이모지는 변형 선택자(FE0F)를 빼요.
 * 서버(data-api)는 `@twemoji/svg` 패키지 파일을, 대시보드는 같은 버전의 CDN 파일을 읽어요.
 */

/** 서버와 대시보드가 같은 그림을 쓰도록 버전을 한 곳에 둬요 (data-api `@twemoji/svg` 의존성과 같아야 해요). */
export const TWEMOJI_VERSION = '15.0.0';

/** 파일 이름으로 쓸 수 있는 코드인지 (경로 조작 방지) */
export const TWEMOJI_CODE_RE = /^[0-9a-f]{2,6}(?:-[0-9a-f]{2,6}){0,9}$/;

function toCode(segment: string): string {
	return [...segment].map((ch) => ch.codePointAt(0)!.toString(16)).join('-');
}

/** 시도할 Twemoji 파일 코드 — 규칙대로 만든 것 먼저, 없으면 FE0F를 모두 뺀 것. 쓸 수 없는 글자면 빈 배열. */
export function twemojiCandidates(segment: string): string[] {
	const primary = toCode(segment.includes('‍') ? segment : segment.replace(/️/g, ''));
	const stripped = toCode(segment.replace(/️/g, ''));
	return [...new Set([primary, stripped])].filter((code) => TWEMOJI_CODE_RE.test(code));
}

/** 대시보드용 CDN 주소 */
export function twemojiCdnUrl(code: string): string {
	return `https://cdn.jsdelivr.net/npm/@twemoji/svg@${TWEMOJI_VERSION}/${code}.svg`;
}
