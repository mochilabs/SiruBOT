/**
 * Lavaplayer base64 트랙 문자열 정규화 — 플레이어 상태(재생 위치)가 섞인 encoded를 곡 identity로 쓸 수 있게 해요.
 * 상태 비의존 순수 모듈이라 application/·lavalink/ 어디서든 import해요.
 */
/**
 * Lavaplayer base64 트랙의 마지막 8바이트(track.getPosition())를 0으로 정규화한다.
 * TrackEndEvent/fetchPlayer 등에서 position > 0으로 인코딩된 문자열이
 * TrackStartEvent/loadTracks 시점(position = 0) 문자열과 달라지는 문제를 막는다.
 */
export function normalizeTrackEncoded(encoded: string): string {
	if (typeof encoded !== 'string' || encoded.length < 20) return encoded;
	try {
		const buf = Buffer.from(encoded, 'base64');
		if (buf.length < 16) return encoded;
		const header = buf.readUInt32BE(0);
		if (header >>> 30 !== 1 || (header & 0x3fffffff) !== buf.length - 4) return encoded;
		if (buf.readBigUInt64BE(buf.length - 8) === 0n) return encoded;
		buf.writeBigUInt64BE(0n, buf.length - 8);
		return buf.toString('base64');
	} catch {
		return encoded;
	}
}

/** position 바이트 차이를 무시하고 두 encoded 문자열이 같은 트랙인지 판별한다. */
export function isSameEncodedTrack(a: unknown, b: unknown): boolean {
	if (typeof a !== 'string' || typeof b !== 'string') return false;
	if (a === b) return true;
	return normalizeTrackEncoded(a) === normalizeTrackEncoded(b);
}
