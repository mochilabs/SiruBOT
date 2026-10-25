import { container } from '@sapphire/framework';
import type { AiTool } from './types.ts';

export const serverInfoTool: AiTool = {
	name: 'server_info',
	description:
		'현재 디스코드 서버(길드)의 기본 정보(서버 이름, 멤버 수, 텍스트/음성 채널 수, 서버 생성일, 티켓 시스템 활성화 여부 등)를 조회해요. ' +
		'사용자가 서버 현황, 인원 수, 개설일, 문의 방법/티켓 설정 등을 물어볼 때 사용하세요.',
	properties: {},
	required: [],
	status: '서버 정보를 확인하는 중..',
	execute: async (_args, ctx) => {
		if (!ctx.guildId) {
			return JSON.stringify({ error: '개인 DM에서는 서버 정보를 조회할 수 없어요.' });
		}

		const guild = container.client.guilds.cache.get(ctx.guildId);
		if (!guild) {
			return JSON.stringify({ error: '서버 정보를 찾지 못했어요.' });
		}

		const textChannels = guild.channels.cache.filter((c) => c.isTextBased()).size;
		const voiceChannels = guild.channels.cache.filter((c) => c.isVoiceBased()).size;

		const ticketConfig = await container.db.ticketConfig
			.findUnique({
				where: { guildId: ctx.guildId }
			})
			.catch(() => null);

		return JSON.stringify({
			name: guild.name,
			id: guild.id,
			memberCount: guild.memberCount,
			channels: {
				text: textChannels,
				voice: voiceChannels,
				total: guild.channels.cache.size
			},
			createdAt: guild.createdAt.toISOString().slice(0, 10),
			ticketSystem: {
				enabled: ticketConfig?.enabled ?? false,
				panelCommand: '/티켓 패널'
			}
		});
	}
};
