/**
 * 토큰 추정 — 컨텍스트 예산 계산에 쓰는 근사치예요.
 */

/**
 * 토큰 수 근사치예요. 한글 글자당 약 0.7, 그 외 약 0.28 토큰으로 보고,
 * 컨텍스트 예산(CHAT_CONTEXT_TOKEN_BUDGET)을 계산하는 데만 써요.
 */
export function estimateTokens(text: string): number {
	if (!text) return 0;
	let dense = 0;
	// 매칭 배열을 새로 할당하지 않는 단일 패스 — append마다 히스토리 전체를 재계산하므로 할당이 금지예요
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (
			(c >= 0x1100 && c <= 0x11ff) || // 한글 자모
			(c >= 0x3130 && c <= 0x318f) || // 한글 호환 자모
			(c >= 0xa960 && c <= 0xa97f) || // 한글 자모 확장-A
			(c >= 0xac00 && c <= 0xd7af) || // 한글 음절
			(c >= 0xff00 && c <= 0xffef) // 전각 문자
		)
			dense++;
	}
	return Math.ceil(dense * 0.7 + (text.length - dense) * 0.28);
}

/** 시스템 프롬프트 전체 토큰 예산 기본값 (64k 윈도우 기준, 나머지는 대화·도구·출력 여유) — CHAT_CONTEXT_TOKEN_BUDGET로 덮어써요 */
const DEFAULT_CONTEXT_TOKEN_BUDGET = 60_000;

/** 마지막으로 파싱한 환경변수 원문 — 값이 바뀔 때만 다시 파싱해요 (런타임에는 부팅 시 1회) */
let cachedBudgetRaw: string | undefined;
let cachedBudget = DEFAULT_CONTEXT_TOKEN_BUDGET;

/** 시스템 프롬프트 전체 토큰 예산 — 환경변수 CHAT_CONTEXT_TOKEN_BUDGET로 조정해요 */
export function getContextTokenBudget(): number {
	const raw = process.env.CHAT_CONTEXT_TOKEN_BUDGET;
	if (raw !== cachedBudgetRaw) {
		cachedBudgetRaw = raw;
		const parsed = parseInt(raw ?? '', 10);
		cachedBudget = Number.isFinite(parsed) ? Math.min(100_000, Math.max(1500, parsed)) : DEFAULT_CONTEXT_TOKEN_BUDGET;
	}
	return cachedBudget;
}
