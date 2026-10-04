import { botHelpTool } from './botHelp.ts';
import { deliveryTool } from './delivery.ts';
import { memoryTools } from './memory.ts';
import { musicTools } from './music.ts';
import { ohaasaTool } from './ohaasa.ts';
import { webSearchTool } from './search.ts';
import type { AiTool, AiToolContext, AiToolDefinition } from './types.ts';
import { weatherTool } from './weather.ts';
import { webFetchTool } from './webFetch.ts';

const TOOLS: AiTool[] = [webSearchTool, webFetchTool, weatherTool, deliveryTool, ohaasaTool, botHelpTool, ...musicTools, ...memoryTools];

const TOOL_MAP = new Map<string, AiTool>(TOOLS.map((tool) => [tool.name, tool]));

export function getAiToolDefinitions(): AiToolDefinition[] {
	return TOOLS.map((tool) => ({
		type: 'function',
		function: {
			name: tool.name,
			description: tool.description,
			parameters: {
				type: 'object' as const,
				properties: tool.properties,
				required: tool.required
			}
		}
	}));
}

/** 도구 인자 JSON을 파싱해요. 빈 인자는 {}, 잘못된 JSON은 null이에요. */
function parseArguments(rawArguments: string): Record<string, unknown> | null {
	const trimmed = rawArguments.trim();
	if (!trimmed) return {};
	try {
		const parsed = JSON.parse(trimmed) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
	} catch {
		return null;
	}
}

/** 도구 실행 중 표시할 행동 멘트를 찾아요. */
export function getAiToolStatus(name: string, rawArguments = ''): string {
	const tool = TOOL_MAP.get(name);
	if (!tool?.status) return `${name} 사용 중...`;
	if (typeof tool.status === 'string') return tool.status;
	return tool.status(parseArguments(rawArguments) ?? {});
}

/** 도구를 실행해요. 절대 throw 하지 않고 항상 LLM이 읽을 수 있는 문자열을 돌려줘요. */
export async function executeAiTool(name: string, rawArguments: string, ctx: AiToolContext): Promise<string> {
	const tool = TOOL_MAP.get(name);
	if (!tool) return JSON.stringify({ error: `알 수 없는 도구예요: ${name}` });

	const args = parseArguments(rawArguments);
	if (args === null) return JSON.stringify({ error: '도구 인자가 올바른 JSON이 아니에요.' });

	try {
		return await tool.execute(args, ctx);
	} catch (error) {
		return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
	}
}

export type { AiTool, AiToolContext, AiToolDefinition } from './types.ts';
