import { ChatInputCommand, PreconditionContainerArray, type SimplePreconditionKeys } from '@sapphire/framework';
import type { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';

export interface SubcommandModule {
	name: string;
	ko: string;
	description: string;
	descriptionEn?: string;
	preconditions: string[];
	build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder;
	run(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown>;
	autocomplete?(interaction: AutocompleteInteraction): Promise<unknown>;
}

export async function runSubcommandPreconditions(
	command: ChatInputCommand,
	interaction: ChatInputCommandInteraction<'cached'>,
	preconditions: string[]
): Promise<void> {
	const result = await new PreconditionContainerArray(preconditions as SimplePreconditionKeys[]).chatInputRun(interaction, command);
	if (result.isErr()) throw result.unwrapErr();
}

export function subcommandSummaries(subcommands: readonly SubcommandModule[]) {
	return subcommands.map(({ name, ko, description, descriptionEn }) => ({ name, ko, description, descriptionEn: descriptionEn ?? description }));
}
