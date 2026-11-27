import type { OhaasaCardRequest, OhaasaTopCardRequest } from '../../../services/dataApiClient.ts';
import type { HoroscopeData } from '../../../services/types.ts';

const COLOR_LABEL = /^(?:럭키\s*컬러|ラッキーカラー|lucky\s*color)\s*[:：]\s*/i;
const KEY_LABEL = /^(?:행운의\s*열쇠|행운의\s*키|幸運の(?:カギ|鍵)|ラッキーキー|lucky\s*key)\s*[:：]\s*/i;
const ITEM_LABEL = /^(?:럭키\s*아이템|행운의\s*아이템|ラッキーアイテム|lucky\s*item)\s*[:：]\s*/i;
const LUCKY_SEP = /\s*[/·・]\s*/;

export function splitOhaasaLucky(lucky: string): { item: string; key: string } {
	const raw = (lucky ?? '').trim();
	if (!raw) return { item: '', key: '' };

	let item = '';
	let key = '';
	const unlabeled: string[] = [];

	for (const segment of raw.split(LUCKY_SEP)) {
		const text = segment.trim();
		if (!text) continue;
		if (COLOR_LABEL.test(text)) continue;
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
	if (!item && unlabeled.length > 0) item = unlabeled.join(' / ');
	return { item, key };
}

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

export function buildOhaasaTopCardRequest(top: HoroscopeData[], date: string): OhaasaTopCardRequest {
	return { items: top.slice(0, 3).map((item) => ({ zodiacCode: item.zodiacCode, rank: item.rank })), date };
}
