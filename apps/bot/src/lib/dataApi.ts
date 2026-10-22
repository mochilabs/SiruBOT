/**
 * data-api(게이트웨이) 호출 계약 — baseURL 해석과 인증 헤더를 한곳에서 관리해요.
 * dataApiClient·playbackReporter·embedFixGateway가 각각 같은 로직을 갖고 있어
 * URL 규약이 바뀌면 3곳을 함께 고쳐야 했어요.
 */

/** `DATA_API_URL` — 설정되지 않았으면 null(호출 차단). 끝의 슬래시는 잘라내요. */
export function gatewayBaseUrl(): string | null {
	const raw = (process.env.DATA_API_URL ?? '').trim().replace(/\/+$/, '');
	return raw || null;
}

/** `DATA_API_AUTH_KEY`(없으면 `AUTH_KEY`) 인증 헤더 — 키가 없으면 빈 맵이에요. */
export function dataApiAuthHeaders(): Record<string, string> {
	const authKey = (process.env.DATA_API_AUTH_KEY ?? process.env.AUTH_KEY ?? '').trim();
	return authKey ? { authorization: authKey } : {};
}
