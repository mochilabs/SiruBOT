import { container } from '@sapphire/framework';
import { type MemoryCategory } from '../aiMemoryService.ts';
import type { AiTool } from './types.ts';

const CATEGORY_HINT = 'facts: 이름·거주지·상황 등 사실 / preferences: 선호·취미·스타일 / commitments: 약속·미결 사항';

const memorySaveTool: AiTool = {
	name: 'memory_save',
	description:
		'장기 기억 파일(MEMORY.md)에 항목 하나를 추가해요. 이름·호칭·선호·취미·약속·상황 등 오래 기억할 만한 정보가 나올 때 쓰세요. ' +
		'섹션은 사실이면 facts, 선호면 preferences, 약속·미결이면 commitments로 골라요. 날짜가 중요한 사실은 "(2026-10-01 확인)"처럼 날짜를 본문에 함께 적어요. ' +
		'같은 내용은 중복 저장되지 않아요. 저장 후 반드시 "(메모리 업데이트됨)"을 사용자에게 보여줘요.',
	properties: {
		category: {
			type: 'string',
			enum: ['facts', 'preferences', 'commitments'],
			description: `기억을 넣을 섹션. ${CATEGORY_HINT}`
		},
		content: {
			type: 'string',
			description: '저장할 항목 (예: "부산 거주, 새벽 작업 선호 (2026-10-01 확인)")'
		}
	},
	required: ['category', 'content'],
	status: '시루가 메모리를 업데이트하는 중..',
	execute: async (args, ctx) => {
		const content = String(args.content ?? '').trim();
		if (!content) throw new Error('저장할 내용이 필요해요.');
		const category = String(args.category ?? '').trim() as MemoryCategory;
		const result = await container.aiMemoryService.saveFact(ctx.userId, category, content);
		return JSON.stringify({ status: 'ok', category, added: result.added, total: result.total });
	}
};

const memoryForgetTool: AiTool = {
	name: 'memory_forget',
	description:
		'장기 기억 파일(MEMORY.md)에서 항목을 삭제해요. 사용자가 "그건 틀렸어 / 잊어 / 지워"라고 했을 때 쓰세요. ' +
		'파일에 적힌 항목 텍스트 일부를 match로 넘기면 해당 항목이 지워져요.',
	properties: {
		match: {
			type: 'string',
			description: '지울 항목의 텍스트 일부 (기억 목록에 적힌 문구의 일부분)'
		}
	},
	required: ['match'],
	status: '시루가 메모리를 삭제하는 중..',
	execute: async (args, ctx) => {
		const match = String(args.match ?? '').trim();
		if (!match) throw new Error('지울 기억의 텍스트가 필요해요.');
		const removed = await container.aiMemoryService.forgetFact(ctx.userId, match);
		if (removed.length === 0) throw new Error(`"${match}"와 일치하는 기억을 찾을 수 없어요.`);
		return JSON.stringify({ status: 'ok', removed });
	}
};

export const memoryTools: AiTool[] = [memorySaveTool, memoryForgetTool];
