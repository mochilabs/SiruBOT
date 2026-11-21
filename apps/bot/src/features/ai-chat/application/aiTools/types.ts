import type { GuildMember } from 'discord.js';

export interface AiToolContext {
	/** 서버 ID (DM이면 null) */
	guildId: string | null;
	/** 대화가 발생한 텍스트 채널 */
	channelId: string;
	/** 명령을 호출한 사용자의 음성 채널 (없으면 null) */
	voiceChannelId: string | null;
	/** 명령을 호출한 사용자의 길드 멤버 (cached guild가 아니면 null) */
	member: GuildMember | null;
	userId: string;
	username: string;
}

/**
 * 도구가 세상에 미치는 영향 — 확인 정책(aiChat/toolConfirmation.ts)이 이 값만 봐요. 필수라 새 도구가 빠뜨리면 typecheck가 실패해요.
 * - read: 읽기만 해요. 확인 없이 실행해요.
 * - music: 재생 상태·대기열을 바꿔요. 그 턴에 외부 내용(`returnsExternalContent` 도구 결과)이 들어왔을 때만 확인을 받아요.
 * - settings: 서버 설정을 바꿔요. 항상 확인을 받아요.
 * - memory: 요청자 본인의 기억을 저장·삭제해요. 확인 없이 실행해요.
 */
export type AiToolEffect = 'read' | 'music' | 'settings' | 'memory';

export interface AiTool {
	name: string;
	effect: AiToolEffect;
	/** 결과에 외부(웹) 내용이 담기면 true — 이 도구가 한 번이라도 실행된 턴은 "외부 내용 포함"으로 표시돼요 */
	returnsExternalContent?: true;
	/** 확인 창에 보여줄 호출 요약 (사람이 읽는 한 줄, 여러 줄이면 줄바꿈) — 미지정이면 도구 이름과 인자를 그대로 보여줘요 */
	summarize?: (args: Record<string, unknown>) => string;
	description: string;
	properties: Record<string, unknown>;
	required: string[];
	/** 도구 실행 중 채널에 띄울 행동 멘트 (함수면 인자로 도구 인자를 받음, 미지정 시 `${name} 사용 중..`) */
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
