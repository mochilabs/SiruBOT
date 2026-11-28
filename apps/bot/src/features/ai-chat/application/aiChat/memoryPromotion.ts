import { MEMORY_CATEGORIES, type MemoryCategory } from '@sirubot/utils';
import { streamChatCompletion } from './completion.ts';
import type { AiChatDeps } from './deps.ts';
import type { ChatConfig } from './types.ts';
import type { Stoppable } from '../../../../lib/lifecycle.ts';

type PromotionDeps = Pick<AiChatDeps, 'logger' | 'memory' | 'promotions'>;

export const PROMOTION_MIN_TURNS = 8;

/** 사용자당 하나만 실행하고, 종료 시 진행 중인 작업 완료를 기다려요. */
export class MemoryPromotionJobs implements Stoppable {
	public readonly name = 'memoryPromotionJobs';
	private readonly jobs = new Map<string, Promise<void>>();
	private stopped = false;

	public run(userId: string, job: () => Promise<void>): void {
		if (this.stopped || this.jobs.has(userId)) return;
		this.jobs.set(
			userId,
			job().finally(() => this.jobs.delete(userId))
		);
	}

	public async stop(): Promise<void> {
		this.stopped = true;
		await Promise.allSettled([...this.jobs.values()]);
	}
}

const COMPRESS_SYSTEM_PROMPT = [
	'당신은 대화를 압축하고 오래갈 정보를 골라내는 기억 관리기예요.',
	'주어진 최근 대화(사용자-봇)에서 아래 두 가지를 동시에 만들어요.',
	'',
	'1) `summary`: 최근 대화를 한국어 한 문단(200자 이내)으로 압축한 롤링 요약.',
	'   - 기존 요약이 있으면 그 요약과 새 대화를 통합한 최종 요약을 써요.',
	'   - 잡담·인사·일회성 질문·음악 재생 명령은 버리고, 이후 대화에 이어질 만한 맥락(주제·상황·미결 사항)만 담아요.',
	'2) `entries`: 오래 기억할 만한 사실·선호·약속 목록(배열).',
	'   - 이름·거주지·직업·취미·선호·싫어하는 것·약속·미결 사항만 담아요.',
	'   - "ㅇㅇ", "ㄱㅅ", "ㅋㅋ", "네", "아니" 같은 단발성 메시지는 절대 담지 않아요.',
	'   - 기존 기억에 이미 있는 내용은 중복으로 넣지 않아요.',
	'   - 날짜가 중요한 사실은 "(2026-10-01 확인)"처럼 날짜를 함께 적어요.',
	'   - 추출할 게 없으면 빈 배열이에요.',
	'',
	'출력 형식(JSON 객체 하나):',
	'{"summary": "한 문단 요약", "entries": [{"category": "facts|preferences|commitments", "text": "내용"}]}',
	'JSON 외 다른 텍스트·설명·코드 펜스는 붙이지 않아요.'
].join('\n');

function buildCompressPrompt(existingSummary: string | null, turns: { q: string; a: string }[]): string {
	const parts: string[] = [];
	if (existingSummary) parts.push('[기존 요약]', existingSummary, '');
	parts.push('[최근 대화]', ...turns.map((t) => `사용자: ${t.q}\n시루: ${t.a}`), '', 'summary와 entries를 담은 JSON 객체를 출력하세요.');
	return parts.join('\n');
}

function stripCodeFences(text: string): string {
	const lines = text.split('\n');
	while (lines.length > 0 && /^```/.test(lines[0]!.trim())) lines.shift();
	while (lines.length > 0 && /^```/.test(lines[lines.length - 1]!.trim())) lines.pop();
	return lines.join('\n').trim();
}

interface CompressResult {
	summary: string;
	entries: { category: MemoryCategory; text: string }[];
}

/** 모델 출력을 파싱해요. 올바르지 않으면 빈 요약·빈 entries(안전 실패). */
function parseCompressResult(raw: string): CompressResult {
	const trimmed = stripCodeFences(raw).trim();
	if (!trimmed) return { summary: '', entries: [] };
	try {
		const parsed = JSON.parse(trimmed) as { summary?: unknown; entries?: unknown };
		const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
		const entries: { category: MemoryCategory; text: string }[] = [];
		if (Array.isArray(parsed.entries)) {
			for (const item of parsed.entries) {
				if (!item || typeof item !== 'object') continue;
				const o = item as { category?: unknown; text?: unknown };
				if (typeof o.text !== 'string' || !o.text.trim()) continue;
				if (typeof o.category !== 'string' || !MEMORY_CATEGORIES.includes(o.category as MemoryCategory)) continue;
				entries.push({ category: o.category as MemoryCategory, text: o.text.trim() });
			}
		}
		return { summary, entries };
	} catch {
		return { summary: '', entries: [] };
	}
}

/**
 * 단기 기억이 충분히 쌓이면 백그라운드에서 압축·승격해요.
 * agentLoop에서 fire-and-forget으로 호출 — 응답 지연 없음.
 */
export function scheduleMemoryPromotion(deps: PromotionDeps, userId: string, config: ChatConfig): void {
	deps.promotions.run(userId, () =>
		runPromotion(deps, userId, config).catch((error) => {
			deps.logger.warn('[aiChat] memory compression/promotion failed:', error);
		})
	);
}

async function runPromotion(deps: PromotionDeps, userId: string, config: ChatConfig): Promise<void> {
	const turns = await deps.memory.getShortTermTurns(userId);
	if (turns.length < PROMOTION_MIN_TURNS) return;

	const [existingSummary, existingFile] = await Promise.all([deps.memory.getShortTermSummary(userId), deps.memory.readFile(userId)]);

	const result = await streamChatCompletion(deps.logger, {
		messages: [
			{ role: 'system', content: COMPRESS_SYSTEM_PROMPT },
			{
				role: 'user',
				content: [existingFile ? `[기존 기억]\n${existingFile}\n\n` : '', buildCompressPrompt(existingSummary, turns)].join('')
			}
		],
		config: { ...config, timeoutMs: Math.min(config.timeoutMs, 45_000) }
	});

	const { summary, entries } = parseCompressResult(result.content);

	// 장기 기억에 새 사실 병합
	let added = 0;
	if (entries.length > 0) {
		added = await deps.memory.mergeLongTerm(userId, entries);
	}

	// 단기 기억 원본을 비우고, 압축 요약을 새 것으로 교체해요
	if (summary) {
		await deps.memory.compactShortTerm(userId, summary);
	} else {
		await deps.memory.clearShortTerm(userId);
	}

	deps.logger.info(`[aiChat] memory compression done for user ${userId} (summary: ${summary.length} chars, added ${added} entries)`);
}
