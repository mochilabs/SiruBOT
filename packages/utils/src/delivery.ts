/**
 * 택배 도메인 계약 — 인터페이스·에러 클래스·운송장번호 정규화의 단일 홈.
 *
 * 배송 조회 구현은 data-api(`/v1/delivery/*`, `apps/data-api/src/providers/delivery.ts`)가 소유하고,
 * 봇은 `services/dataApiClient.ts`의 trackDelivery로 게이트웨이를 호출해 같은 타입을 써요.
 * 택배사 별칭 해석·캐시 키는 data-api 쪽에 남아 있어요.
 */

/** 택배 조회 실패, 서브패스별 단일 홈 정책이라 공용 Error 베이스 없이 이 파일에 정의해요 */
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

/** 운송장번호 정규화 — 공백·하이픈 제거 */
export function normalizeTrackingNumber(raw: string): string {
	return raw.trim().replace(/[\s-]/g, '');
}
