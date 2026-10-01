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
	/** 도구 실행 중 채널에 띄울 행동 멘트 (함수면 인자로 도구 인자를 받음, 미지정 시 `${name} 사용 중...`) */
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
