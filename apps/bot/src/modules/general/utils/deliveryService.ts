/**
 * 택배 도메인 에러 클래스·운송장 정규화.
 *
 * 배송 조회 자체는 data-api(`/v1/delivery/*`, providers/delivery.ts)가 담당 —
 * 봇은 `services/dataApiClient.ts`의 trackDelivery로 게이트웨이를 호출하고,
 * 응답 타입은 `services/types.ts`, 이 파일은 운송장번호 정규화와 에러 식별만 담당해요.
 */

export class DeliveryError extends Error {
	public constructor(
		public readonly identifier: string,
		message: string
	) {
		super(message);
		this.name = 'DeliveryError';
	}
}

/** 운송장번호 정규화 — 공백·하이픈 제거 */
export function normalizeTrackingNumber(raw: string): string {
	return raw.trim().replace(/[\s-]/g, '');
}
