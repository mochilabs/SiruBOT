import type { FastifyInstance } from 'fastify';
import type { OpenAICompatTranslationProvider } from '../providers/translate.ts';
import { metrics } from '../utils/metrics.ts';
import { sendError } from './common.ts';
import { customCommandDraftRequestSchema, generateCustomCommandDraft } from './customCommandDraft.ts';
import { customCommandRefineRequestSchema, generateCustomCommandRefine } from './customCommandRefine.ts';

/** 커스텀 명령어 AI 생성 — 자연어 설명 → JSON 스펙 초안(draft)과 반복 수정(refine). 파싱·재검증 루프는 customCommandDraft/Refine.ts가 소유해요. */

export function registerAiRoutes(fastify: FastifyInstance, deps: { draftProvider: OpenAICompatTranslationProvider }): void {
	// ── 커스텀 명령어 AI 초안 (대시보드 빌더: 자연어 설명 → JSON 스펙 초안) ──
	// LLM 출력은 라우트 모듈에서 파싱+스키마 재검증(1회 재시도)을 거쳐요. 생성기 미설정이면
	// 503으로 안내해 대시보드가 그대로 보여줘요.
	const draftRequestSchema = customCommandDraftRequestSchema;
	fastify.post('/v1/ai/custom-command-draft', async (request, reply) => {
		try {
			const { prompt } = draftRequestSchema.parse(request.body);
			if (!deps.draftProvider.available) {
				return reply.code(503).send({
					error: 'draft_unavailable',
					message: 'AI 초안 생성기가 설정되지 않았어요. 봇 관리자에게 OPENAI_API_KEY 설정을 문의해 주세요.'
				});
			}
			const result = await generateCustomCommandDraft(deps.draftProvider, prompt);
			if (!result.ok) {
				console.warn(`[data-api] custom command draft failed: ${result.reason}`);
				return reply.code(502).send({ error: 'draft_failed', message: 'AI 초안 생성에 실패했어요. 잠시 후 다시 시도해 주세요.' });
			}
			metrics.request('custom-command-draft');
			return reply.send(result.draft);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// 커스텀 명령어 AI 반복 수정 — 현재 스펙 + 수정 지시(+최근 대화 기억)를 받아 지시된 부분만 바꾼
	// 전체 스펙을 돌려줘요. 초안과 같은 provider·검증 루프를 써요.
	const refineRequestSchema = customCommandRefineRequestSchema;
	fastify.post('/v1/ai/custom-command-refine', async (request, reply) => {
		try {
			const refineRequest = refineRequestSchema.parse(request.body);
			if (!deps.draftProvider.available) {
				return reply.code(503).send({
					error: 'draft_unavailable',
					message: 'AI 수정 기능이 설정되지 않았어요. 봇 관리자에게 OPENAI_API_KEY 설정을 문의해 주세요.'
				});
			}
			const result = await generateCustomCommandRefine(deps.draftProvider, refineRequest);
			if (!result.ok) {
				console.warn(`[data-api] custom command refine failed: ${result.reason}`);
				return reply.code(502).send({ error: 'refine_failed', message: 'AI 수정에 실패했어요. 잠시 후 다시 시도해 주세요.' });
			}
			metrics.request('custom-command-refine');
			return reply.send({ spec: result.spec });
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
