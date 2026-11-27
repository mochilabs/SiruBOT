import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// AES-256-GCM at-rest encryption: base64url(iv):base64url(authTag):base64url(ciphertext).
export type SecretBoxKey = Buffer;

const IV_BYTES = 12;

export function deriveKeyFromSecret(secret: string | null | undefined): SecretBoxKey | null {
	const value = secret?.trim();
	if (!value) return null;
	return createHash('sha256').update(value).digest();
}

export function encryptSecret(plain: string, key: SecretBoxKey | null): string {
	if (!key) return '';
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join(':');
}

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

export function decryptsWith(encrypted: string, key: SecretBoxKey | null): boolean {
	return decryptSecret(encrypted, [key]) !== null;
}
