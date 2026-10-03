/** 한글 자소 분해 — 초성 → 초+중성 → 완성 글자의 타이핑 중간 상태 배열 */
const CHOSEONG = [
	"ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
];

export function decomposeHangul(char: string): string[] {
	const code = char.charCodeAt(0) - 0xac00;
	if (code < 0 || code > 11171) return [char];

	const jong = code % 28;
	const jung = ((code - jong) / 28) % 21;
	const cho = ((code - jong) / 28 - jung) / 21;

	const states = [CHOSEONG[cho]];
	states.push(String.fromCharCode(0xac00 + (cho * 21 + jung) * 28));
	if (jong > 0) {
		states.push(String.fromCharCode(0xac00 + (cho * 21 + jung) * 28 + jong));
	}

	return states;
}