import { container } from '@sapphire/framework';
import { ApplicationCommandOptionType, type ApplicationCommand } from 'discord.js';
import { commandMention, fetchCommandIndex } from '../../modules/general/utils/commandMentions.ts';
import type { AiTool } from './types.ts';

interface CommandEntry {
	name: string;
	mention: string;
	category: string;
	description: string;
	/** 등록된 인자/서브명령 요약 — name: description (필수 여부) */
	options: string[];
	/** 기본 권한 제한이 있으면 권한명 목록 */
	permissions?: string[];
}

/** 등록된 애플리케이션 명령어에서 인자·서브명령 요약을 뽑아요 */
function describeOptions(command: ApplicationCommand): string[] {
	const lines: string[] = [];
	for (const option of command.options ?? []) {
		if (option.type === ApplicationCommandOptionType.Subcommand) {
			lines.push(`${option.name}: ${option.descriptionLocalizations?.ko ?? option.description}`);
		} else if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
			for (const sub of option.options ?? []) {
				lines.push(`${option.name} ${sub.name}: ${sub.descriptionLocalizations?.ko ?? sub.description}`);
			}
		} else {
			const required = option.required ? ' (필수)' : '';
			lines.push(`${option.name}: ${option.descriptionLocalizations?.ko ?? option.description}${required}`);
		}
	}
	return lines;
}

export const botHelpTool: AiTool = {
	name: 'bot_help',
	description:
		'시루가 사용자에게 보여줄 수 있는 슬래시 명령어 목록과 각 명령어의 속성(설명, 인자, 서브명령, 권한)을 조회해요. ' +
		'사용자가 "뭐 할 수 있어", "무엇이 가능해", "명령어 알려줘", "사용법" 등을 물으면 호출하세요. ' +
		'result.commands[].mention은 클릭해서 바로 실행되는 명령어 링크이니 사용자 답변에 그대로 넣으세요.',
	properties: {
		query: {
			type: 'string',
			description: '결과를 필터할 키워드 — 명령어 이름·설명·카테고리 일부 (예: "음악", "청소"). 생략하면 전체 목록이에요.'
		}
	},
	required: [],
	status: '시루가 명령어 목록을 확인하는 중..',
	execute: async (args, ctx) => {
		const query = String(args.query ?? '')
			.trim()
			.toLowerCase();
		const index = await fetchCommandIndex(ctx.guildId);
		const commands = container.stores.get('commands');

		const entries: CommandEntry[] = [];
		for (const [, cmd] of commands) {
			const preconditions = cmd.options.preconditions;
			if (Array.isArray(preconditions) && preconditions.includes('OwnerOnly')) continue;

			const category = cmd.fullCategory.join(' / ');
			const description = cmd.description;
			if (query && !`${cmd.name} ${description} ${category}`.toLowerCase().includes(query)) continue;

			const registered = index.get(cmd.name);
			const entry: CommandEntry = {
				name: cmd.name,
				mention: commandMention(cmd.name, index),
				category,
				description,
				options: []
			};

			if (registered) {
				entry.options = describeOptions(registered);
				const permissions = registered.defaultMemberPermissions;
				if (permissions && permissions.bitfield !== 0n) {
					entry.permissions = permissions.toArray();
				}
			}

			entries.push(entry);
		}

		return JSON.stringify({ count: entries.length, commands: entries });
	}
};
