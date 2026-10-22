import { ChatInputCommand, PreconditionContainerArray, type SimplePreconditionKeys } from '@sapphire/framework';
import type { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';

/** 서브커맨드 모듈 공통 형태 — 여러 하위 명령어를 한 커맨드로 묶은 디스패처(/음악, /정보)가 공유해요 */
export interface SubcommandModule {
	name: string;
	ko: string;
	description: string;
	preconditions: string[];
	build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder;
	run(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown>;
	autocomplete?(interaction: AutocompleteInteraction): Promise<unknown>;
}

/**
 * 서브커맨드별 precondition 실행 — 커맨드를 하나로 합치면 union precondition이
 * 가벼운 하위 명령어(예: /음악 가사)까지 음성 채널을 요구하게 되므로 서브커맨드 단위로 나눠서 실행해요.
 */
export async function runSubcommandPreconditions(
	command: ChatInputCommand,
	interaction: ChatInputCommandInteraction<'cached'>,
	preconditions: string[]
): Promise<void> {
	// 프레임워크와 같은 방식으로 실행 — 없는 precondition/핸들러도 표준 에러로 처리돼요
	const result = await new PreconditionContainerArray(preconditions as SimplePreconditionKeys[]).chatInputRun(interaction, command);
	if (result.isErr()) throw result.unwrapErr();
}

/** /도움말에서 서브커맨드 멘션을 그릴 때 쓰는 요약 */
export function subcommandSummaries(subcommands: readonly SubcommandModule[]) {
	return subcommands.map(({ name, ko, description }) => ({ name, ko, description }));
}
