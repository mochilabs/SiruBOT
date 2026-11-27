export interface GifTiming {
	width: number;
	height: number;
	frames: number;
	durationMs: number;
}

// Browser rule: 0-1cs delays map to 100ms.
function frameDelayMs(centiseconds: number): number {
	return (centiseconds <= 1 ? 10 : centiseconds) * 10;
}

function skipSubBlocks(bytes: Uint8Array, start: number): number {
	let pos = start;
	while (pos < bytes.length) {
		const size = bytes[pos]!;
		pos += 1;
		if (size === 0) return pos;
		pos += size;
	}
	return -1;
}

export function parseGifTiming(bytes: Uint8Array): GifTiming | null {
	if (bytes.length < 13 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x38) return null;
	const width = bytes[6]! | (bytes[7]! << 8);
	const height = bytes[8]! | (bytes[9]! << 8);
	if (width === 0 || height === 0) return null;

	let pos = 13;
	const flags = bytes[10]!;
	if (flags & 0x80) pos += 3 * (1 << ((flags & 0x07) + 1));

	let frames = 0;
	let durationMs = 0;
	let pendingDelay = 0;
	while (pos < bytes.length) {
		const block = bytes[pos]!;
		if (block === 0x3b) break;
		if (block === 0x21) {
			const label = bytes[pos + 1];
			if (label === 0xf9 && pos + 5 < bytes.length) pendingDelay = bytes[pos + 4]! | (bytes[pos + 5]! << 8);
			pos = skipSubBlocks(bytes, pos + 2);
		} else if (block === 0x2c) {
			if (pos + 10 > bytes.length) return null;
			const imageFlags = bytes[pos + 9]!;
			pos += 10;
			if (imageFlags & 0x80) pos += 3 * (1 << ((imageFlags & 0x07) + 1));
			pos = skipSubBlocks(bytes, pos + 1);
			frames += 1;
			durationMs += frameDelayMs(pendingDelay);
			pendingDelay = 0;
		} else {
			return null;
		}
		if (pos < 0) return frames > 0 ? { width, height, frames, durationMs: frames > 1 ? durationMs : 0 } : null;
	}
	if (frames === 0) return null;
	return { width, height, frames, durationMs: frames > 1 ? durationMs : 0 };
}

export function parseGifDataUriTiming(dataUri: string | null | undefined): GifTiming | null {
	if (!dataUri || !dataUri.startsWith('data:image/gif;base64,')) return null;
	const cached = cache.get(dataUri);
	if (cached !== undefined) return cached;
	let result: GifTiming | null = null;
	try {
		const binary = atob(dataUri.slice('data:image/gif;base64,'.length));
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
		result = parseGifTiming(bytes);
	} catch {
		result = null;
	}
	if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
	cache.set(dataUri, result);
	return result;
}

const CACHE_LIMIT = 4;
const cache = new Map<string, GifTiming | null>();
