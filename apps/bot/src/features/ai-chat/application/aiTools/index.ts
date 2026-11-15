import { createBotHelpTool } from './botHelp.ts';
import { deliveryTool } from './delivery.ts';
import { createMemoryTools } from './memory.ts';
import { createMusicTools } from './music.ts';
import { ohaasaTool } from './ohaasa.ts';
import { createWebSearchTool } from './search.ts';
import type { AiToolRegistry } from '../aiChat/deps.ts';
import type { AiToolDeps } from './deps.ts';
import type { AiTool, AiToolContext, AiToolDefinition } from './types.ts';
import { weatherTool } from './weather.ts';
import { webFetchTool } from './webFetch.ts';
import { createServerInfoTool } from './serverInfo.ts';
import { createMusicSettingsTools } from './musicSettings.ts';
import { createBotSettingsTools } from './botSettings.ts';

function toolDefinitions(tools: AiTool[]): AiToolDefinition[] {
	return tools.map((tool) => ({
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
function toolStatus(toolMap: Map<string, AiTool>, name: string, rawArguments = ''): string {
	const tool = toolMap.get(name);
	if (!tool?.status) return `${name} 사용 중..`;
	if (typeof tool.status === 'string') return tool.status;
	return tool.status(parseArguments(rawArguments) ?? {});
}

/** 도구를 실행해요. 절대 throw 하지 않고 항상 LLM이 읽을 수 있는 문자열을 돌려줘요. */
async function executeTool(toolMap: Map<string, AiTool>, name: string, rawArguments: string, ctx: AiToolContext): Promise<string> {
	const tool = toolMap.get(name);
	if (!tool) return JSON.stringify({ error: `알 수 없는 도구예요: ${name}` });

	const args = parseArguments(rawArguments);
	if (args === null) return JSON.stringify({ error: '도구 인자가 올바른 JSON이 아니에요.' });

	try {
		return await tool.execute(args, ctx);
	} catch (error) {
		return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
	}
}

/**
 * AI 도구 레지스트리를 deps로 한 번 만들어요 (BotApplication.setupServices). 도구 이름·설명·스키마는 LLM 계약이라 순서까지 그대로예요.
 * 날씨·택배처럼 deps가 필요 없는 도구는 모듈 상수를 그대로 써요.
 */
export function createAiTools(deps: AiToolDeps): AiToolRegistry {
	const tools: AiTool[] = [
		createWebSearchTool(deps),
		webFetchTool,
		weatherTool,
		deliveryTool,
		ohaasaTool,
		createBotHelpTool(deps),
		createServerInfoTool(deps),
		...createMusicTools(deps),
		...createMusicSettingsTools(deps),
		...createBotSettingsTools(deps),
		...createMemoryTools(deps)
	];
	const toolMap = new Map<string, AiTool>(tools.map((tool) => [tool.name, tool]));
	return {
		getDefinitions: () => toolDefinitions(tools),
		getStatus: (name, rawArguments = '') => toolStatus(toolMap, name, rawArguments),
		execute: (name, rawArguments, ctx) => executeTool(toolMap, name, rawArguments, ctx)
	};
}

export type { AiTool, AiToolContext, AiToolDefinition } from './types.ts';
export type { AiToolDeps, AiToolCommandInfo, AiToolSearchConfig } from './deps.ts';
