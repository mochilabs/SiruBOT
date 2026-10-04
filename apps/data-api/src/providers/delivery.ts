export const DELIVERY_REST_BASE_URL = 'https://apis.tracker.delivery';
export const DELIVERY_TIMEOUT_MS = 15_000;

export class DeliveryError extends Error {
	public constructor(
		public readonly identifier: string,
		message: string
	) {
		super(message);
		this.name = 'DeliveryError';
	}
}

export interface DeliveryCarrier {
	id: string;
	name: string;
	tel?: string;
}

export interface DeliveryProgress {
	time: string | null;
	statusText: string;
	location: string | null;
	description: string | null;
}

export interface DeliveryTrackResult {
	carrier: DeliveryCarrier;
	stateText: string;
	fromName: string | null;
	fromTime: string | null;
	toName: string | null;
	toTime: string | null;
	progresses: DeliveryProgress[];
}

interface LegacyRestResponse {
	carrier?: { id?: string; name?: string; tel?: string };
	from?: { name?: string | null; time?: string | null };
	to?: { name?: string | null; time?: string | null };
	state?: { id?: string; text?: string };
	progresses?: Array<{
		time?: string | null;
		status?: { id?: string; text?: string };
		location?: { name?: string | null };
		description?: string | null;
	}>;
}

/** 한국어 택배사 별칭 → tracker.delivery carrier ID */
export const CARRIER_ALIASES: Record<string, string> = {
	cj: 'kr.cjlogistics',
	cj대한통운: 'kr.cjlogistics',
	cj택배: 'kr.cjlogistics',
	대한통운: 'kr.cjlogistics',
	한진: 'kr.hanjin',
	한진택배: 'kr.hanjin',
	롯데: 'kr.lotte',
	롯데택배: 'kr.lotte',
	로젠: 'kr.logen',
	로젠택배: 'kr.logen',
	우체국: 'kr.epost',
	우체국택배: 'kr.epost',
	쿠팡: 'kr.coupangls',
	쿠팡로지스틱스: 'kr.coupangls',
	gs: 'kr.cvsnet',
	gs포스트박스: 'kr.cvsnet',
	gs25: 'kr.cvsnet',
	cway: 'kr.cway',
	우리택배: 'kr.cway',
	대신: 'kr.daesin',
	대신택배: 'kr.daesin',
	경동: 'kr.kdexp',
	경동택배: 'kr.kdexp',
	합동: 'kr.hdexp',
	합동택배: 'kr.hdexp',
	한의사랑: 'kr.hanips',
	hpl: 'kr.hanips',
	홈픽: 'kr.homepick',
	homepick: 'kr.homepick',
	천일: 'kr.chunilps',
	천일택배: 'kr.chunilps',
	호남: 'kr.honamlogis',
	용마: 'kr.yongmalogis',
	용마로지스: 'kr.yongmalogis',
	slx: 'kr.slx',
	ltl: 'kr.ltl',
	판토스: 'kr.epantos',
	lx판토스: 'kr.epantos',
	ems: 'kr.epost.ems',
	dhl: 'de.dhl',
	fedex: 'us.fedex',
	ups: 'us.ups',
	usps: 'us.usps',
	tnt: 'nl.tnt',
	일본우정: 'jp.japanpost',
	야마토: 'jp.yamato',
	사가와: 'jp.sagawa'
};

export function normalizeCarrierInput(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return trimmed;
	const lower = trimmed.toLowerCase();
	if (CARRIER_ALIASES[lower]) return CARRIER_ALIASES[lower]!;
	if (CARRIER_ALIASES[trimmed]) return CARRIER_ALIASES[trimmed]!;
	if (/^[a-z]{2}\.[a-z0-9._-]+$/i.test(trimmed)) return trimmed;
	return trimmed;
}

export function normalizeTrackingNumber(raw: string): string {
	return raw.trim().replace(/[\s-]/g, '');
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

function normalizeLegacyResponse(data: LegacyRestResponse): DeliveryTrackResult {
	const progresses: DeliveryProgress[] = Array.isArray(data.progresses)
		? data.progresses.map((p) => ({
				time: p.time ?? null,
				statusText: p.status?.text ?? '',
				location: p.location?.name ?? null,
				description: p.description ?? null
			}))
		: [];
	return {
		carrier: { id: data.carrier?.id ?? '', name: data.carrier?.name ?? '', tel: data.carrier?.tel },
		stateText: data.state?.text ?? '',
		fromName: data.from?.name ?? null,
		fromTime: data.from?.time ?? null,
		toName: data.to?.name ?? null,
		toTime: data.to?.time ?? null,
		progresses
	};
}

/** Legacy v1 REST 조회 (API 키 불필요) */
export async function trackViaRest(carrierId: string, trackingNumber: string): Promise<DeliveryTrackResult> {
	const url = `${DELIVERY_REST_BASE_URL}/carriers/${encodeURIComponent(carrierId)}/tracks/${encodeURIComponent(trackingNumber)}`;
	let res: Response;
	try {
		res = await fetchWithTimeout(url, DELIVERY_TIMEOUT_MS);
	} catch (e) {
		throw new DeliveryError('delivery_unreachable', `택배 조회 서버에 연결할 수 없어요. (${e instanceof Error ? e.message : String(e)})`);
	}
	if (res.status === 404) {
		throw new DeliveryError(
			'delivery_track_not_found',
			'택배사 또는 운송장번호를 찾을 수 없어요. 택배사 이름과 운송장번호를 다시 확인해 주세요.'
		);
	}
	if (!res.ok) {
		throw new DeliveryError('delivery_http_error', `택배 조회에 실패했어요. (HTTP ${res.status})`);
	}
	const data = (await res.json()) as LegacyRestResponse;
	if (!data || !data.state) {
		throw new DeliveryError('delivery_track_not_found', '배송 정보가 없어요. 운송장번호를 확인해 주세요.');
	}
	return normalizeLegacyResponse(data);
}

let carrierCache: { at: number; carriers: DeliveryCarrier[] } | null = null;
const CARRIER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function getCarriersCached(): Promise<DeliveryCarrier[]> {
	if (carrierCache && Date.now() - carrierCache.at < CARRIER_CACHE_TTL_MS) return carrierCache.carriers;
	let res: Response;
	try {
		res = await fetchWithTimeout(`${DELIVERY_REST_BASE_URL}/carriers`, DELIVERY_TIMEOUT_MS);
	} catch (e) {
		throw new DeliveryError('delivery_unreachable', `택배사 목록을 불러오지 못했어요. (${e instanceof Error ? e.message : String(e)})`);
	}
	if (!res.ok) throw new DeliveryError('delivery_http_error', `택배사 목록 조회에 실패했어요. (HTTP ${res.status})`);
	const data = (await res.json()) as Array<{ id?: string; name?: string; tel?: string }>;
	if (!Array.isArray(data)) throw new DeliveryError('delivery_malformed', '택배사 목록 형식이 올바르지 않아요.');
	const carriers = data
		.filter((c) => typeof c.id === 'string' && typeof c.name === 'string')
		.map((c) => ({ id: c.id!, name: c.name!, tel: c.tel }));
	carrierCache = { at: Date.now(), carriers };
	return carriers;
}

export function searchCarriersLocal(carriers: DeliveryCarrier[], query: string, limit = 5): DeliveryCarrier[] {
	const q = query.trim().toLowerCase();
	if (!q) return carriers.slice(0, limit);
	const scored = carriers
		.map((carrier) => {
			const id = carrier.id.toLowerCase();
			const name = carrier.name.toLowerCase();
			let score = -1;
			if (id === q || name === q) score = 0;
			else if (id.startsWith(q) || name.startsWith(q)) score = 1;
			else if (id.includes(q) || name.includes(q)) score = 2;
			else if (Object.entries(CARRIER_ALIASES).some(([alias, aliasId]) => aliasId === carrier.id && alias.includes(query.trim()))) score = 3;
			return { carrier, score };
		})
		.filter((s) => s.score >= 0);
	scored.sort((a, b) => a.score - b.score);
	return scored.slice(0, limit).map((s) => s.carrier);
}

/** 별칭이 아닌 입력을 택배사 목록에서 검색해 carrier id로 해석 */
export async function resolveCarrierId(carrierHint: string): Promise<string> {
	const normalized = normalizeCarrierInput(carrierHint);
	if (/^[a-z]{2}\.[a-z0-9._-]+$/i.test(normalized)) return normalized;
	const carriers = await getCarriersCached();
	const candidates = searchCarriersLocal(carriers, carrierHint, 5);
	if (candidates.length === 0) {
		throw new DeliveryError('delivery_carrier_not_found', `'${carrierHint}'에 해당하는 택배사를 찾을 수 없어요. 택배사 이름을 확인해 주세요.`);
	}
	return candidates[0]!.id;
}

/** 택배사 목록 조회 (공유 캐시용) */
export async function listCarriers(): Promise<DeliveryCarrier[]> {
	return getCarriersCached();
}

/** 택배사 목록 장기 캐시 (거의 안 바뀌어요) */
export function deliveryCarriersCacheKey(): string {
	return 'dataapi:v1:delivery:carriers';
}

/** 운송장 조회 단기 캐시 (배송 상태는 변해요) */
export function deliveryTrackCacheKey(carrierId: string, trackingNumber: string): string {
	return `dataapi:v1:delivery:track:${carrierId}:${trackingNumber}`;
}

/** 택배사 힌트(별칭/이름/id) → 조회까지 한 번에. 별칭 해석도 서버에서 해요. */
export async function trackDelivery(carrierHint: string, trackingNumber: string): Promise<DeliveryTrackResult> {
	const carrierId = await resolveCarrierId(carrierHint);
	return trackViaRest(carrierId, normalizeTrackingNumber(trackingNumber));
}
