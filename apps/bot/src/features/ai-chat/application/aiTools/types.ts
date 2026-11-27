import type { GuildMember } from 'discord.js';

export interface AiToolContext {
	guildId: string | null;
	channelId: string;
	voiceChannelId: string | null;
	member: GuildMember | null;
	userId: string;
	username: string;
}

export type AiToolEffect = 'read' | 'music' | 'settings' | 'memory';

export interface AiTool {
	name: string;
	effect: AiToolEffect;
	returnsExternalContent?: true;
	summarize?: (args: Record<string, unknown>) => string;
	description: string;
	properties: Record<string, unknown>;
	required: string[];
	status?: string | ((args: Record<string, unknown>) => string);
	execute: (args: Record<string, unknown>, ctx: AiToolContext) => Promise<string>;
}

export interface AiToolDefinition {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: {
			type: 'object';
			properties: Record<string, unknown>;
			required: string[];
		};
	};
}
