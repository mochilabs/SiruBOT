import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { createContainer, DEFAULT_COLOR } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, type ContainerBuilder } from 'discord.js';

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
		const segments = splitForTyping(this.collectHelpLines());

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
		await interaction.editReply({ components: [buildHelpContainer(shown, false)] }).catch(() => undefined);
	}

	private collectHelpLines(): string[] {
		const commands = this.container.stores.get('commands');

		const audioCommands: string[] = [];
		const gameCommands: string[] = [];
		const generalCommands: string[] = [];

		for (const [, cmd] of commands) {
			const mention = `</${cmd.name}:0>`;
			const desc = cmd.description;
			const line = `${mention} — ${desc}`;

			if (cmd.fullCategory.includes('음악')) {
				audioCommands.push(line);
			} else if (cmd.fullCategory.includes('게임')) {
				gameCommands.push(line);
			} else if (!AI_COMMAND_NAMES.has(cmd.name)) {
				const preconditions = cmd.options.preconditions;
				const isOwnerOnly = Array.isArray(preconditions) && preconditions.includes('OwnerOnly');
				if (!isOwnerOnly) {
					generalCommands.push(line);
				}
			}
		}

		return [
			'안녕하세요, 시루예요! 🎵',
			'음악 재생부터 AI 대화까지 — 제가 할 수 있는 것들을 알려드릴게요.',
			'',
			'🤖 **AI로 이런 것들**',
			'- `/채팅`으로 질문·요약·번역 뭐든 시켜요. 사진을 함께 보내면 그것도 봐요.',
			'- 채널에서 저를 멘션하면 어디서든 바로 답해줘요.',
			'- 기억할 일은 알아서 남겼다가 다음에 또 말해요. "이거 기억해줘", "이거 잊어줘"로 직접 관리할 수 있고, `/채팅설정`에서 서버별로 켜고 끌 수 있어요.',
			'- 답이 늘어지면 "중지" 버튼으로 바로 끊어요.',
			'',
			'📋 **명령어 목록**',
			'',
			'**🎵 오디오**',
			...audioCommands,
			'',
			'**🎮 게임**',
			...gameCommands,
			'',
			'**🛠️ 일반**',
			...generalCommands
		];
	}
}
