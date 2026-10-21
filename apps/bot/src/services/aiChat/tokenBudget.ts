/**
 * 토큰 추정 — 컨텍스트 예산 계산에 쓰는 근사치예요.
 */

/** 한글 등 고밀도 문자 — 토큰 추정에서 글자당 가중치를 높게 줘요 */
const DENSE_CHARS_RE = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯＀-￯]/g;

/**
 * 토큰 수 근사치예요. 한글 글자당 약 0.7, 그 외 약 0.28 토큰으로 보고,
 * 컨텍스트 예산(CHAT_CONTEXT_TOKEN_BUDGET)을 계산하는 데만 써요.
 */
export function estimateTokens(text: string): number {
	if (!text) return 0;
	const dense = text.match(DENSE_CHARS_RE)?.length ?? 0;
	return Math.ceil(dense * 0.7 + (text.length - dense) * 0.28);
}

/** 시스템 프롬프트 전체 토큰 예산 기본값 (64k 윈도우 기준, 나머지는 대화·도구·출력 여유) — CHAT_CONTEXT_TOKEN_BUDGET로 덮어써요 */
const DEFAULT_CONTEXT_TOKEN_BUDGET = 60_000;

/** 시스템 프롬프트 전체 토큰 예산 — 환경변수 CHAT_CONTEXT_TOKEN_BUDGET로 조정해요 */
export function getContextTokenBudget(): number {
	const parsed = parseInt(process.env.CHAT_CONTEXT_TOKEN_BUDGET ?? '', 10);
	return Number.isFinite(parsed) ? Math.min(100_000, Math.max(1500, parsed)) : DEFAULT_CONTEXT_TOKEN_BUDGET;
}
