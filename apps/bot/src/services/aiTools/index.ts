import { deliveryTool } from './delivery.ts';
import { musicTools } from './music.ts';
import { ohaasaTool } from './ohaasa.ts';
import { webSearchTool } from './search.ts';
import type { AiTool, AiToolContext, AiToolDefinition } from './types.ts';
import { weatherTool } from './weather.ts';

const TOOLS: AiTool[] = [webSearchTool, weatherTool, deliveryTool, ohaasaTool, ...musicTools];

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

/** 도구를 실행해요. 절대 throw 하지 않고 항상 LLM이 읽을 수 있는 문자열을 돌려줘요. */
export async function executeAiTool(name: string, rawArguments: string, ctx: AiToolContext): Promise<string> {
	const tool = TOOL_MAP.get(name);
	if (!tool) return JSON.stringify({ error: `알 수 없는 도구예요: ${name}` });

	let args: Record<string, unknown> = {};
	const trimmed = rawArguments.trim();
	if (trimmed) {
		try {
			args = JSON.parse(trimmed) as Record<string, unknown>;
		} catch {
			return JSON.stringify({ error: '도구 인자가 올바른 JSON이 아니에요.' });
		}
	}

	try {
		return await tool.execute(args, ctx);
	} catch (error) {
		return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
	}
}

export type { AiTool, AiToolContext, AiToolDefinition } from './types.ts';
