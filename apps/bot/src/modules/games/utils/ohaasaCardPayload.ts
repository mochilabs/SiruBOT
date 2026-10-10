/**
 * 오하아사 카드 이미지 payload 구성 — /v1/ohaasa의 horoscope 1건에서 요약 필드만 골라요.
 * 카드는 별자리·순위·행운의 아이템/열쇠·날짜만 그리고, 운세 설명과 럭키 컬러는
 * 텍스트 본문 전용이라 payload에 아예 넣지 않아요 (이미지/본문 내용 불일치 원천 차단).
 */
import type { OhaasaCardRequest } from '../../../services/dataApiClient.ts';
import type { HoroscopeData } from './ohaasaService.ts';

/**
 * 럭키 문자열에서 럭키 컬러를 걸러 아이템/열쇠만 남겨요.
 * 주중엔 오하아사 JSON의 단일 아이템 문자열("타올", "핑크색"), 주말엔 TV 아사히 형식
 * ("럭키 컬러: 빨강 · 행운의 열쇠: 친구" / 원문 "ラッキーカラー：赤 / 幸運のカギ：手紙")이 와요.
 */
const COLOR_LABEL = /^(?:럭키\s*컬러|ラッキーカラー|lucky\s*color)\s*[:：]\s*/i;
const KEY_LABEL = /^(?:행운의\s*열쇠|행운의\s*키|幸運の(?:カギ|鍵)|ラッキーキー|lucky\s*key)\s*[:：]\s*/i;
const ITEM_LABEL = /^(?:럭키\s*아이템|행운의\s*아이템|ラッキーアイテム|lucky\s*item)\s*[:：]\s*/i;
/** 라벨 구분자 — 슬래시(TV아사히 원문)·중점(번역본)·가타카나 중점 */
const LUCKY_SEP = /\s*[/·・]\s*/;

/** 럭키 문자열 분리 — 라벨 없는 조각은 아이템으로 취급해요. */
export function splitOhaasaLucky(lucky: string): { item: string; key: string } {
	const raw = (lucky ?? '').trim();
	if (!raw) return { item: '', key: '' };

	let item = '';
	let key = '';
	const unlabeled: string[] = [];

	for (const segment of raw.split(LUCKY_SEP)) {
		const text = segment.trim();
		if (!text) continue;
		if (COLOR_LABEL.test(text)) continue; // 럭키 컬러는 카드에서 빠져요 — 텍스트 본문 전용
		const keyMatch = text.match(KEY_LABEL);
		if (keyMatch) {
			key = text.slice(keyMatch[0].length).trim();
			continue;
		}
		const itemMatch = text.match(ITEM_LABEL);
		if (itemMatch) {
			item = text.slice(itemMatch[0].length).trim();
			continue;
		}
		unlabeled.push(text);
	}
	if (unlabeled.length > 0) item = unlabeled.join(' / ');
	return { item, key };
}

/** 카드 이미지 요청 — 텍스트 본문과 같은 horoscope 건에서 파생해요. */
export function buildOhaasaCardRequest(target: HoroscopeData, date: string): OhaasaCardRequest {
	const { item, key } = splitOhaasaLucky(target.lucky);
	return {
		zodiacCode: target.zodiacCode,
		rank: target.rank,
		luckyItem: item || undefined,
		luckyKey: key || undefined,
		date
	};
}
