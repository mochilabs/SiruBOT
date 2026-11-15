import type { ApplicationCommand } from 'discord.js';

/** 클릭해서 바로 실행되는 명령어 멘션 — ID를 못 찾으면 인라인 코드로 대체해요 (순수 문자열 조립, 조회는 discord/utils/commandMentions.ts) */
export function commandMention(name: string, index: ReadonlyMap<string, ApplicationCommand>): string {
	const command = index.get(name);
	return command ? `</${name}:${command.id}>` : `\`/${name}\``;
}
