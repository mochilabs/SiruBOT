import { container } from '@sapphire/framework';
import type { ApplicationCommand } from 'discord.js';

/** 글로벌/길드 명령어 조회 결과 캐시 TTL — 등록 외에는 안 바뀌니 10분이면 충분해요 */
const INDEX_TTL_MS = 10 * 60_000;
/** key: ''(글로벌만) 또는 길드 ID */
const indexCache = new Map<string, { at: number; commands: Map<string, ApplicationCommand> }>();

/**
 * 이름 → 실제 애플리케이션 명령어 맵을 조회해요 (글로벌 + 해당 길드 등록분).
 * 조회 실패 시 이전 캐시, 그것도 없으면 빈 맵 — 멘션은 일반 텍스트로 대체돼요.
 */
export async function fetchCommandIndex(guildId?: string | null): Promise<Map<string, ApplicationCommand>> {
	const key = guildId ?? '';
	const cached = indexCache.get(key);
	if (cached && Date.now() - cached.at < INDEX_TTL_MS) return cached.commands;

	try {
		const application = container.client.application;
		if (!application) return cached?.commands ?? new Map();

		const map = new Map<string, ApplicationCommand>();
		const globalCommands = await application.commands.fetch();
		globalCommands.forEach((command) => map.set(command.name, command));

		if (guildId) {
			const guild = await container.client.guilds.fetch(guildId).catch(() => null);
			const guildCommands = await guild?.commands.fetch().catch(() => null);
			guildCommands?.forEach((command) => map.set(command.name, command));
		}

		indexCache.set(key, { at: Date.now(), commands: map });
		return map;
	} catch (error) {
		container.logger.warn(`[commandMentions] failed to fetch command index: ${error}`);
		return cached?.commands ?? new Map();
	}
}

/** 클릭해서 바로 실행되는 명령어 멘션 — ID를 못 찾으면 인라인 코드로 대체해요 */
export function commandMention(name: string, index: ReadonlyMap<string, ApplicationCommand>): string {
	const command = index.get(name);
	return command ? `</${name}:${command.id}>` : `\`/${name}\``;
}
