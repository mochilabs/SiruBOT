/**
 * Takumi 카드 공용 키트 중 런타임 독립 부분 — 요소 헬퍼, 폰트 이름, 이모지 제거, 비동기 LRU예요 (node·브라우저 공용).
 * 폰트 파일 읽기, 네이티브 래스터, 원격 이미지 다운로드 같은 node 전용 코드는 data-api `renderers/takumi/takumiKit.tsx`에 있어요.
 * 이 패키지는 JSX 빌드 설정 없이 쓰려고 `h()`로 요소를 만들어요 (data-api 카드는 TSX예요).
 */

/** Takumi `fromJsx`가 받는 요소 — React 타입에 의존하지 않는 최소 형태예요. */
export interface CardElement {
	type: string;
	props: { style?: Record<string, string | number>; children?: CardChild | CardChild[]; [key: string]: unknown };
}
export type CardChild = CardElement | string | number | null | false;

/** flex 컨테이너 요소 — Takumi의 div는 기본이 block이라 `display: flex`를 기본값으로 넣어요. */
export function h(type: string, style: Record<string, string | number>, children?: CardChild | CardChild[]): CardElement {
	return { type, props: { style: { display: 'flex', ...style }, children } };
}

/** 이미지 요소 — src는 data URI(또는 Buffer)를 권장해요. 원격 URL은 렌더러가 직접 받아 SSRF 경계가 사라져요. */
export function img(src: string, style: Record<string, string | number>): CardElement {
	return { type: 'img', props: { src, style } };
}

/** 카드 폰트 패밀리 이름 — fontFamily에 이 값을 써요. */
export const CARD_FONT = 'Pretendard';

/**
 * 색 이모지를 지원하지 않아서 렌더 전에 이모지를 지워요 — 지우지 않으면 이모지 폭만큼 빈칸이 남아 제목 사이가 벌어져요.
 * 숫자·#·*는 Extended_Pictographic이 아니라 그대로 남아요. 지운 뒤 생긴 연속 공백은 하나로 줄여요.
 */
export function stripEmoji(text: string): string {
	return text
		.replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[‍️⃣]/gu, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

/**
 * 키별 비동기 결과를 최근 사용 순으로 max개까지 기억하는 캐시예요 (동시 요청은 하나로 합쳐요). null·실패는 기억하지 않아 다음에 다시 시도해요.
 * 같은 곡의 볼륨·일시정지·반복·챕터 변경처럼 입력이 거의 같은 재렌더에서 이미지 다운로드와 처리를 건너뛰는 용도예요.
 */
export function createAsyncLru<T>(max: number, load: (key: string) => Promise<T | null>): (key: string) => Promise<T | null> {
	const entries = new Map<string, Promise<T | null>>();
	return (key) => {
		const hit = entries.get(key);
		if (hit) {
			entries.delete(key); // 최근 사용으로 갱신
			entries.set(key, hit);
			return hit;
		}
		const promise = load(key).then(
			(value) => {
				if (value === null && entries.get(key) === promise) entries.delete(key);
				return value;
			},
			(error: unknown) => {
				if (entries.get(key) === promise) entries.delete(key);
				throw error;
			}
		);
		entries.set(key, promise);
		if (entries.size > max) entries.delete(entries.keys().next().value as string);
		return promise;
	};
}
