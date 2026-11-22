/**
 * GIF 헤더 파서 — 크기·프레임 수·한 바퀴 길이(ms)를 디코딩 없이 읽어요 (node·브라우저 공용, 외부 의존성 없음).
 * 인사 카드가 GIF 배경이 움직이는지, 카드 한 바퀴 길이를 얼마로 잡을지 정하는 데 써요.
 */

export interface GifTiming {
	width: number;
	height: number;
	/** 이미지 프레임 수 — 1이면 정지 GIF예요 */
	frames: number;
	/** 모든 프레임 지연의 합(ms). 정지 GIF는 0이에요 */
	durationMs: number;
}

/** 브라우저와 같은 규칙 — 지연이 0~1(센티초)이면 10센티초(100ms)로 봐요 */
function frameDelayMs(centiseconds: number): number {
	return (centiseconds <= 1 ? 10 : centiseconds) * 10;
}

/** 서브블록 열(길이 바이트 + 데이터, 길이 0으로 끝)을 건너뛰고 다음 위치를 돌려줘요. 잘린 파일이면 -1이에요. */
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

/** GIF 바이트에서 타이밍을 읽어요. GIF가 아니거나 잘려서 읽을 수 없으면 null이에요. */
export function parseGifTiming(bytes: Uint8Array): GifTiming | null {
	// "GIF87a" / "GIF89a" + 논리 화면 설명자(너비·높이 각 2바이트 LE, 플래그, 배경색, 비율)
	if (bytes.length < 13 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x38) return null;
	const width = bytes[6]! | (bytes[7]! << 8);
	const height = bytes[8]! | (bytes[9]! << 8);
	if (width === 0 || height === 0) return null;

	let pos = 13;
	const flags = bytes[10]!;
	if (flags & 0x80) pos += 3 * (1 << ((flags & 0x07) + 1)); // 전역 색상표

	let frames = 0;
	let durationMs = 0;
	let pendingDelay = 0;
	while (pos < bytes.length) {
		const block = bytes[pos]!;
		if (block === 0x3b) break; // 트레일러
		if (block === 0x21) {
			// 확장 블록 — 0xF9는 그래픽 제어(다음 프레임의 지연), 나머지는 건너뛰어요
			const label = bytes[pos + 1];
			if (label === 0xf9 && pos + 5 < bytes.length) pendingDelay = bytes[pos + 4]! | (bytes[pos + 5]! << 8);
			pos = skipSubBlocks(bytes, pos + 2);
		} else if (block === 0x2c) {
			// 이미지 설명자: 위치·크기 8바이트 + 플래그 → 지역 색상표 → LZW 최소 코드 크기 → 서브블록
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

/** `data:image/gif;base64,…`에서 타이밍을 읽어요. GIF 데이터 URI가 아니거나 읽을 수 없으면 null이에요. */
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
	// 같은 배경을 렌더·에디터 갱신마다 다시 읽지 않게 최근 몇 개만 기억해요
	if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
	cache.set(dataUri, result);
	return result;
}

const CACHE_LIMIT = 4;
const cache = new Map<string, GifTiming | null>();
