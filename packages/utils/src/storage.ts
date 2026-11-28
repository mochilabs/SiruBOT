import { z } from 'zod';

export const ASSET_BUCKET = 'guild-assets';
export const ASSET_MAX_BYTES = 8 * 1024 * 1024;
export const ASSET_ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export const ASSET_NAME_MAX_LENGTH = 60;

const MIME_TO_EXT: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif'
};

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const TICKET_TRANSCRIPT_BUCKET = 'ticket-transcripts';

export function sniffImageMime(bytes: Uint8Array): string | null {
	if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
	if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return 'image/webp';
	}
	return null;
}

export function assetKeyFor(guildId: string, assetId: string, mime: string): string {
	const ext = MIME_TO_EXT[mime];
	if (!ext) throw new Error(`지원하지 않는 이미지 형식이에요: ${mime}`);
	if (!SAFE_ID_PATTERN.test(guildId) || !SAFE_ID_PATTERN.test(assetId)) {
		throw new Error('에셋 ID 형식이 올바르지 않아요.');
	}
	if (guildId.includes('..') || assetId.includes('..')) throw new Error('에셋 ID 형식이 올바르지 않아요.');
	return `${guildId}/${assetId}.${ext}`;
}

export const assetNameSchema = z
	.string()
	.trim()
	.min(1, '이름을 입력해 주세요.')
	.max(ASSET_NAME_MAX_LENGTH, `${ASSET_NAME_MAX_LENGTH}자 이내로 입력해 주세요.`);
