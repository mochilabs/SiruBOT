import { decryptSecret, deriveKeyFromSecret, encryptSecret } from '@sirubot/utils/secretBox';

const PREFIX = 'enc:v1:';

/** AUTH_KEY 회전 시 이전 키를 DATA_ENCRYPTION_KEY에 남기면 기존 행도 복호돼요. */
function encryptionSecrets(): string[] {
	return [process.env.DATA_ENCRYPTION_KEY?.trim(), process.env.AUTH_KEY?.trim(), process.env.NOTIFIER_AUTH_KEY?.trim()].filter(
		(value): value is string => Boolean(value)
	);
}

/** NOTIFIER_AUTH_KEY는 복호 보조용이며 저장 키로는 쓰지 않아요. */
function primaryStorageKey(): Buffer | null {
	return deriveKeyFromSecret(process.env.DATA_ENCRYPTION_KEY?.trim() || process.env.AUTH_KEY?.trim());
}

export function sealWebhookToken(token: string): string {
	const key = primaryStorageKey();
	if (!key) return token;
	return `${PREFIX}${encryptSecret(token, key)}`;
}

export function openWebhookToken(stored: string): string {
	if (!stored.startsWith(PREFIX)) return stored;
	return decryptSecret(stored.slice(PREFIX.length), encryptionSecrets().map(deriveKeyFromSecret)) ?? '';
}
