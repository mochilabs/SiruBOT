import { decryptSecret, decryptsWith, deriveKeyFromSecret, encryptSecret } from '@sirubot/utils/secretBox';

/**
 * notifier의 저장 데이터 암호화 (at-rest).
 *
 * `SocialSubscription.webhookToken`은 Discord 웹훅 **전송 권한 크리덴셜**이라 DB에 평문으로 두면
 * DB 덤프 한 번으로 그 서버 채널에 메시지를 보낼 수 있어요. 여기서는 저장 직전 암호화하고
 * 사용 직전 복호해요.
 *
 * 키 정책은 대시보드 OAuth 토큰과 같은 계약이에요:
 * - 전용 키 `DATA_ENCRYPTION_KEY` 우선, 없으면 `AUTH_KEY`(봇·data-api·storage·notifier 공유 키)에서 유도.
 * - 복호는 두 키를 모두 시도해 키 회전 중 혼재 행도 읽어요.
 * - 키가 하나도 없으면 **평문 저장**으로 폴백해요(개발·초기 배포 호환). 운영에서는 전용 키를 설정해야 해요.
 */

const PREFIX = 'enc:v1:';

/**
 * 복호 후보 키 목록 — 1순위는 저장에 쓰는 키(전용 → AUTH_KEY), 그다음 NOTIFIER_AUTH_KEY.
 * `AUTH_KEY`가 바뀌면 **이전 값**을 `DATA_ENCRYPTION_KEY`에 남겨 두면 기존 행도 계속 읽혀요.
 */
function encryptionSecrets(): string[] {
	return [process.env.DATA_ENCRYPTION_KEY?.trim(), process.env.AUTH_KEY?.trim(), process.env.NOTIFIER_AUTH_KEY?.trim()].filter(
		(value): value is string => Boolean(value)
	);
}

/** 저장(봉인)에 쓰는 키 — 전용 키 → AUTH_KEY. NOTIFIER_AUTH_KEY는 복호 보조용이라 저장 키로는 쓰지 않아요. */
function primaryStorageKey(): Buffer | null {
	return deriveKeyFromSecret(process.env.DATA_ENCRYPTION_KEY?.trim() || process.env.AUTH_KEY?.trim());
}

/** 키가 하나도 없으면 평문 유지 (개발/초기 배포 호환), 있으면 암호문으로 저장해요. */
export function sealWebhookToken(token: string): string {
	const key = primaryStorageKey();
	if (!key) return token;
	return `${PREFIX}${encryptSecret(token, key)}`;
}

/** 암호문(prefix 있음)만 복호해요. 평문(구 데이터)은 그대로 돌려줘서 마이그레이션 없이 동작해요. */
export function openWebhookToken(stored: string): string {
	if (!stored.startsWith(PREFIX)) return stored;
	return decryptSecret(stored.slice(PREFIX.length), encryptionSecrets().map(deriveKeyFromSecret)) ?? '';
}

/** 저장 값이 현재 저장 키가 아닌 옛 키(또는 평문)로 되어 있는지 — 맞으면 저장 시점에 다시 봉인해요. */
export function webhookTokenNeedsSeal(stored: string): boolean {
	const key = primaryStorageKey();
	if (!key) return false;
	if (!stored.startsWith(PREFIX)) return true;
	return !decryptsWith(stored.slice(PREFIX.length), key);
}
