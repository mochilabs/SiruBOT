import type { FastifyInstance } from 'fastify';
import type { OpenAICompatTranslationProvider } from '../providers/translate.ts';
import { getLogger } from '../utils/logger.ts';
import { metrics } from '../utils/metrics.ts';
import { sendError } from './common.ts';
import { customCommandDraftRequestSchema, generateCustomCommandDraft } from './customCommandDraft.ts';
import { customCommandRefineRequestSchema, generateCustomCommandRefine } from './customCommandRefine.ts';

const logger = getLogger('ai');

export function registerAiRoutes(fastify: FastifyInstance, deps: { draftProvider: OpenAICompatTranslationProvider }): void {
	fastify.post('/v1/ai/custom-command-draft', async (request, reply) => {
		try {
			const { prompt } = customCommandDraftRequestSchema.parse(request.body);
			if (!deps.draftProvider.available) {
				return reply.code(503).send({
					error: 'draft_unavailable',
					message: 'AI 초안 생성기가 설정되지 않았어요. 봇 관리자에게 OPENAI_API_KEY 설정을 문의해 주세요.'
				});
			}
			const result = await generateCustomCommandDraft(deps.draftProvider, prompt);
			if (!result.ok) {
				logger.warn(`custom command draft failed: ${result.reason}`);
				return reply.code(502).send({ error: 'draft_failed', message: 'AI 초안 생성에 실패했어요. 잠시 후 다시 시도해 주세요.' });
			}
			metrics.request('custom-command-draft');
			return reply.send(result.draft);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.post('/v1/ai/custom-command-refine', async (request, reply) => {
		try {
			const refineRequest = customCommandRefineRequestSchema.parse(request.body);
			if (!deps.draftProvider.available) {
				return reply.code(503).send({
					error: 'draft_unavailable',
					message: 'AI 수정 기능이 설정되지 않았어요. 봇 관리자에게 OPENAI_API_KEY 설정을 문의해 주세요.'
				});
			}
			const result = await generateCustomCommandRefine(deps.draftProvider, refineRequest);
			if (!result.ok) {
				logger.warn(`custom command refine failed: ${result.reason}`);
				return reply.code(502).send({ error: 'refine_failed', message: 'AI 수정에 실패했어요. 잠시 후 다시 시도해 주세요.' });
			}
			metrics.request('custom-command-refine');
			return reply.send({ spec: result.spec });
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
