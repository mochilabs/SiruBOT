export interface AiToolContext {
	/** 서버 ID (DM이면 null) */
	guildId: string | null;
	/** 대화가 발생한 텍스트 채널 */
	channelId: string;
	/** 명령을 호출한 사용자의 음성 채널 (없으면 null) */
	voiceChannelId: string | null;
	userId: string;
	username: string;
}

export interface AiTool {
	name: string;
	description: string;
	properties: Record<string, unknown>;
	required: string[];
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
