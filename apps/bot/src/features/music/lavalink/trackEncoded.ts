/** Zero out the trailing 8-byte Lavaplayer position so encoded track strings compare equal across playback. */
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

export function isSameEncodedTrack(a: unknown, b: unknown): boolean {
	if (typeof a !== 'string' || typeof b !== 'string') return false;
	if (a === b) return true;
	return normalizeTrackEncoded(a) === normalizeTrackEncoded(b);
}
