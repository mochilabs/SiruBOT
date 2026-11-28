export function estimateTokens(text: string): number {
	if (!text) return 0;
	let dense = 0;
	// 매칭 배열 할당을 피하기 위한 단일 패스
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (
			(c >= 0x1100 && c <= 0x11ff) ||
			(c >= 0x3130 && c <= 0x318f) ||
			(c >= 0xa960 && c <= 0xa97f) ||
			(c >= 0xac00 && c <= 0xd7af) ||
			(c >= 0xff00 && c <= 0xffef)
		)
			dense++;
	}
	return Math.ceil(dense * 0.7 + (text.length - dense) * 0.28);
}
