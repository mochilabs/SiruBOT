import { performWebSearch, stripTags } from './searchEngine.ts';
import type { AiToolDeps } from './deps.ts';
import type { AiTool } from './types.ts';

export { stripTags };

/** 웹 검색 도구를 만들어요 — 검색 설정은 deps로 받아요 */
export function createWebSearchTool(deps: Pick<AiToolDeps, 'getSearchConfig'>): AiTool {
	return {
		name: 'web_search',
		description:
			'웹 검색을 수행해 최신·실시간 정보(뉴스, 일정, 가격, 이슈, 인물, 최신 사건)를 확인해요. 날씨·배송 조회는 각각 전용 도구를 쓰고, 그 외 사실 확인이 필요하면 이 도구를 사용하세요. 반환된 sources의 내용과 출처 ID([S1], [S2] 등)를 문장에 인용해 답변하세요. URL은 본문에 직접 적지 마세요.',
		properties: {
			query: {
				type: 'string',
				description: '검색어 (자연어 질문이어도 괜찮아요. 핵심 키워드로 줄이면 좋아요)'
			},
			max_results: {
				type: 'integer',
				description: '돌려줄 결과 개수 (기본 5, 최대 10)'
			}
		},
		required: ['query'],
		status: '시루가 인터넷 검색을 하는 중..',
		execute: async (args) => {
			const query = String(args.query ?? '').trim();
			if (!query) throw new Error('검색어가 필요해요.');
			const maxResults = Math.min(Math.max(Number(args.max_results) || 5, 1), 10);
			const sources = await performWebSearch(deps.getSearchConfig(), query, maxResults);
			return JSON.stringify({
				status: 'success',
				message:
					'성공적으로 검색을 완료했습니다. 아래 sources를 바탕으로 답변하세요. URL은 본문에 절대 직접 쓰지 말고 [S1], [S2]처럼 source id로 인용하세요. 링크 목록은 시스템이 자동으로 추가합니다.',
				query,
				count: sources.length,
				sources
			});
		}
	};
}
