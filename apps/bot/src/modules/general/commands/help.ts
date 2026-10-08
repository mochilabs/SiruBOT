import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { appEmoji, createContainer, DEFAULT_COLOR } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, type ApplicationCommand, type ContainerBuilder } from 'discord.js';
import { MUSIC_SUBCOMMANDS } from '../../audio/commands/music.ts';
import { commandMention, fetchCommandIndex } from '../utils/commandMentions.ts';
import { INFO_SUBCOMMANDS } from './info.ts';

/** 조각 간 간격 — webhook 편집 제한(5/2초) 여유 있게 유지해요 */
const TYPING_STEP_MIN_MS = 420;
const TYPING_STEP_MAX_MS = 560;
const MAX_TYPING_STEPS = 10;
const TYPING_CURSOR = '▍';

/** 편집 레이트리밋을 피해 목록 줄들을 단계 조각으로 뻗어요 */
function splitForTyping(lines: string[]): string[] {
	const size = Math.max(1, Math.ceil(lines.length / MAX_TYPING_STEPS));
	const segments: string[] = [];
	for (let i = 0; i < lines.length; i += size) {
		segments.push(lines.slice(i, i + size).join('\n'));
	}
	return segments;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHelpContainer(content: string, typing: boolean): ContainerBuilder {
	const container = createContainer();
	container.setAccentColor(DEFAULT_COLOR);
	container.addTextDisplayComponents((t) => t.setContent(typing ? `${content}${TYPING_CURSOR}` : content));
	return container;
}

/** 서브커맨드 클릭 멘션 — </music play:ID> 형태. ID를 못 찾으면 인라인 코드로 대체해요 */
function subcommandMention(commandName: string, subcommandName: string, index: ReadonlyMap<string, ApplicationCommand>): string {
	const command = index.get(commandName);
	return command ? `</${commandName} ${subcommandName}:${command.id}>` : `\`/${commandName} ${subcommandName}\``;
}

/** AI 섹션에 따로 적어 일반 목록에서는 제외하는 명령어들 */
const AI_COMMAND_NAMES = new Set(['chat', 'chat-settings']);

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'help',
	description: '사용 가능한 명령어 목록을 보여줘요.'
})
export class HelpCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '도움말' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '사용 가능한 명령어 목록을 보여줘요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const index = await fetchCommandIndex(interaction.guildId);
		const segments = splitForTyping(this.collectHelpLines(index));

		await interaction.reply({
			components: [buildHelpContainer(segments[0] ?? '', true)],
			flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
		});

		let shown = segments[0] ?? '';
		for (let i = 1; i < segments.length; i++) {
			await sleep(TYPING_STEP_MIN_MS + Math.random() * (TYPING_STEP_MAX_MS - TYPING_STEP_MIN_MS));
			shown = `${shown}\n${segments[i]}`;
			// 한 번 실패해도 다음 조각이 전체 누적 본문을 다시 쓰므로 자연스럽게 복구돼요
			await interaction.editReply({ components: [buildHelpContainer(shown, true)] }).catch(() => undefined);
		}

		await sleep(TYPING_STEP_MIN_MS);
		// 마지막 커서 제거가 한 번 실패하면 화면에 커서가 영구히 남으니 1회 재시도해요
		await interaction.editReply({ components: [buildHelpContainer(shown, false)] }).catch(async () => {
			await interaction.editReply({ components: [buildHelpContainer(shown, false)] }).catch(() => undefined);
		});
	}

	private collectHelpLines(index: ReadonlyMap<string, ApplicationCommand>): string[] {
		const commands = this.container.stores.get('commands');

		const audioCommands: string[] = [];
		const gameCommands: string[] = [];
		const generalCommands: string[] = [];

		for (const [, cmd] of commands) {
			const mention = commandMention(cmd.name, index);
			const desc = cmd.description;
			const line = `${mention} — ${desc}`;

			if (cmd.fullCategory.includes('음악')) {
				audioCommands.push(line);
				if (cmd.name === 'music') {
					for (const sub of MUSIC_SUBCOMMANDS) {
						audioCommands.push(`　└ ${subcommandMention('music', sub.name, index)} — ${sub.description}`);
					}
				}
			} else if (cmd.fullCategory.includes('게임')) {
				gameCommands.push(line);
			} else if (!AI_COMMAND_NAMES.has(cmd.name)) {
				const preconditions = cmd.options.preconditions;
				const isOwnerOnly = Array.isArray(preconditions) && preconditions.includes('OwnerOnly');
				if (!isOwnerOnly) {
					generalCommands.push(line);
					if (cmd.name === 'info') {
						for (const sub of INFO_SUBCOMMANDS) {
							generalCommands.push(`　└ ${subcommandMention('info', sub.name, index)} — ${sub.description}`);
						}
					}
				}
			}
		}

		return [
			`안녕하세요, 시루예요! ${appEmoji('music_note', '🎵')}`,
			'음악 재생부터 AI 대화까지 — 제가 할 수 있는 것들을 알려드릴게요.',
			'',
			`${appEmoji('robot', '🤖')} **AI로 이런 것들**`,
			'- `/채팅`으로 질문·요약·번역 뭐든 시켜요. 사진을 함께 보내면 그것도 봐요.',
			'- 채널에서 저를 멘션하면 어디서든 바로 답해줘요.',
			'- 기억할 일은 알아서 남겼다가 다음에 또 말해요. "이거 기억해줘", "이거 잊어줘"로 직접 관리할 수 있고, `/채팅설정`에서 서버별로 켜고 끌 수 있어요.',
			'- 답이 늘어지면 "중지" 버튼으로 바로 끊어요.',
			'',
			`${appEmoji('clipboard', '📋')} **명령어 목록**`,
			'',
			`**${appEmoji('music_note', '🎵')} 오디오**`,
			...audioCommands,
			'',
			`**${appEmoji('gamepad', '🎮')} 게임**`,
			...gameCommands,
			'',
			`**${appEmoji('tools', '🛠️')} 일반**`,
			...generalCommands
		];
	}
}
