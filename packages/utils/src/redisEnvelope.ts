/**
 * Redis 서비스 간 메시지 서명 봉투 — pub/sub 채널에 쓸 수 있는 사람은 키만 있으면 아무나라서,
 * 요청/응답 위조(길드 데이터 조회, 유저 사칭 재생 제어 등)를 막으려고 발신 측에서 HMAC-SHA256 서명을 붙이고
 * 수신 측에서 검증해요 (SEC-006).
 *
 * - 봉투 형태: `{ body: 페이로드 JSON 문자열, sig: HMAC-SHA256(body) hex }` — body를 불투명 문자열로
 *   다뤄 재직렬화로 인한 서명 불일치가 없어요.
 * - 키 계약: `REDIS_AUTH_KEY ?? AUTH_KEY`를 봇과 data-api가 공유해요 (서비스 인증 키와 같은 계열).
 * - 키가 없으면 서명 없이 동작하는 구버전 모드예요 — 개발/standalone 환경 호환용이며,
 *   프로덕션은 AUTH_KEY가 필수라 항상 서명이 켜져요. 키가 있는 쪽은 서명 없는 메시지를 거부해요
 *   (fail-closed — 키 설정이 어긋나면 메시지가 드롭되므로 배포 시 양쪽 키를 맞춰야 해요).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Redis 메시지 서명 키 — REDIS_AUTH_KEY가 있으면 우선, 없으면 서비스 공유 AUTH_KEY. 둘 다 없으면 ''(서명 없음). */
export function resolveRedisSigningKey(env: Record<string, string | undefined>): string {
	const redisKey = (env.REDIS_AUTH_KEY ?? '').trim();
	if (redisKey) return redisKey;
	return (env.AUTH_KEY ?? '').trim();
}

/** 페이로드를 직렬화해 서명 봉투로 감싸요 — 키가 없으면 서명 없는 구버전 본문을 그대로 보내요. */
export function wrapRedisMessage(signingKey: string, payload: unknown): string {
	const body = JSON.stringify(payload);
	if (!signingKey) return body;
	const sig = createHmac('sha256', signingKey).update(body).digest('hex');
	return JSON.stringify({ body, sig });
}

/**
 * 서명 봉투를 검증해 본문(JSON 문자열)을 돌려줘요 — 검증 실패(서명 없음·불일치·형식 오류)면 null.
 * 키가 없으면 검증 없이 raw를 그대로 돌려주는 구버전 모드예요.
 */
export function unwrapRedisMessage(signingKey: string, raw: string): string | null {
	if (!signingKey) return raw;
	let envelope: unknown;
	try {
		envelope = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof envelope !== 'object' || envelope === null) return null;
	const { body, sig } = envelope as { body?: unknown; sig?: unknown };
	if (typeof body !== 'string' || typeof sig !== 'string') return null;
	const expected = Buffer.from(createHmac('sha256', signingKey).update(body).digest('hex'), 'utf8');
	const provided = Buffer.from(sig, 'utf8');
	if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
	return body;
}
