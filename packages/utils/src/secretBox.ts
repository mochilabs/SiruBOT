import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * 저장 데이터 암호화(at-rest) 공용 계약 — Discord OAuth 토큰·웹훅 토큰처럼
 * "유출되면 바로 권한이 되는" 값에 써요.
 *
 * 형식: `base64url(iv):base64url(authTag):base64url(ciphertext)` — AES-256-GCM, iv 12바이트 랜덤.
 * 키는 **문자열 시크릿이 아니라 32바이트 버퍼**를 받아요. 각 앱이 자기 env에서 키를 만들고
 * (전용 키 → 세션 시크릿 폴백 같은 정책은 앱이 소유), 이 모듈은 순수 암복호만 담당해요.
 */

/** 키를 만들 수 없을 때 — 호출부가 "암호화 불가"로 graceful하게 처리하도록 null을 돌려줘요. */
export type SecretBoxKey = Buffer;

const IV_BYTES = 12;
const KEY_BYTES = 32;

/** 시크릿 문자열 → 32바이트 키 (SHA-256 다이제스트). 빈 문자열이면 null. */
export function deriveKeyFromSecret(secret: string | null | undefined): SecretBoxKey | null {
	const value = secret?.trim();
	if (!value) return null;
	return createHash('sha256').update(value).digest();
}

/** 랜덤 키 생성 — 운영 env에 넣을 값을 만들 때 써요 (`openssl rand -base64 32`와 동등) */
export function generateSecretKeyHex(): string {
	return randomBytes(KEY_BYTES).toString('hex');
}

/** 평문 → `iv:tag:ciphertext` (전부 base64url). 키가 없으면 빈 문자열. */
export function encryptSecret(plain: string, key: SecretBoxKey | null): string {
	if (!key) return '';
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join(':');
}

/** 암호문 복호 — 형식/인증 실패 시 null(throw 금지). 후보 키를 순서대로 시도해 회전 중 혼재 행을 읽어요. */
export function decryptSecret(encrypted: string, keys: readonly (SecretBoxKey | null)[]): string | null {
	const [ivPart, tagPart, dataPart] = encrypted.split(':');
	if (!ivPart || !tagPart || !dataPart) return null;
	const iv = Buffer.from(ivPart, 'base64url');
	const authTag = Buffer.from(tagPart, 'base64url');
	const ciphertext = Buffer.from(dataPart, 'base64url');

	for (const key of keys) {
		if (!key) continue;
		try {
			const decipher = createDecipheriv('aes-256-gcm', key, iv);
			decipher.setAuthTag(authTag);
			return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
		} catch {
			continue;
		}
	}
	return null;
}

/** 이 암호문이 주어진 키로 복호되는지 — 키 회전 시 "다시 암호화 필요" 판정용 (평문은 버려요). */
export function decryptsWith(encrypted: string, key: SecretBoxKey | null): boolean {
	return decryptSecret(encrypted, [key]) !== null;
}
