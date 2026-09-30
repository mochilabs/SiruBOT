import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import {
	ChatServiceError,
	clearChannelHistory,
	getChannelHistory,
	getChatConfig,
	pushChannelHistory,
	streamChatCompletion,
	type ChatMessage,
	type ChatConfig
} from '../../../services/aiChatService.ts';

const LIVE_TEXT_LIMIT = 3_800;
const FINAL_SEGMENT_LIMIT = 3_800;
const MAX_FINAL_SEGMENTS = 4;

function chunkText(text: string): string[] {
	if (text.length <= FINAL_SEGMENT_LIMIT) return [text];
	const segments: string[] = [];
	let remaining = text;
	while (remaining.length > 0 && segments.length < MAX_FINAL_SEGMENTS) {
		segments.push(remaining.slice(0, FINAL_SEGMENT_LIMIT));
		remaining = remaining.slice(FINAL_SEGMENT_LIMIT);
	}
	if (remaining.length > 0) segments[MAX_FINAL_SEGMENTS - 1] = `${segments[MAX_FINAL_SEGMENTS - 1]}\n… (답장이 너무 길어 잘렸어요)`;
	return segments;
}

function liveContainer(text: string, config: ChatConfig) {
	const shown = text.length > LIVE_TEXT_LIMIT ? `${text.slice(0, LIVE_TEXT_LIMIT)}…` : text;
	const container = createContainer();
	container.addTextDisplayComponents((t) =>
		t.setContent(['### 💬 시루', '', shown || '생각하는 중...', '', `-# ${config.model} · 답장 중...`].join('\n'))
	);
	return container;
}

function finalContainer(text: string, config: ChatConfig, turnCount: number) {
	const segments = chunkText(text);
	const container = createContainer();
	container.addTextDisplayComponents((t) => t.setContent(['### 💬 시루', '', segments[0]].join('\n')));
	for (const segment of segments.slice(1)) {
		container.addTextDisplayComponents((t) => t.setContent(segment));
	}
	container.addTextDisplayComponents((t) => t.setContent(`-# ${config.model} · 대화 기록 ${turnCount}턴 · \`/채팅 리셋:true\`로 초기화`));
	return container;
}

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'chat',
	description: 'AI와 대화해요. 대화 기록은 채널 단위로 기억해요.',
	fullCategory: ['일반']
})
export class ChatCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '채팅' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: 'AI와 대화해요. 같은 채널에서는 대화를 이어서 기억해요.' })
				.addStringOption((option) =>
					option
						.setName('prompt')
						.setNameLocalizations({ ko: '질문' })
						.setDescription('Your message to the AI')
						.setDescriptionLocalizations({ ko: 'AI에게 보낼 메시지' })
						.setRequired(true)
						.setMaxLength(2000)
				)
				.addBooleanOption((option) =>
					option
						.setName('reset')
						.setNameLocalizations({ ko: '리셋' })
						.setDescription('Reset conversation history before sending')
						.setDescriptionLocalizations({ ko: '보내기 전에 이 채널의 대화 기록을 초기화해요.' })
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const config = getChatConfig();
		if (!config) {
			throw new UserError({
				identifier: 'chat_not_configured',
				message: '❌ AI 서버가 설정되지 않았어요. `apps/bot/.env`에 `CHAT_MODEL`을(를) 설정해 주세요.',
				context: { ephemeral: true }
			});
		}

		const prompt = interaction.options.getString('prompt', true);
		const reset = interaction.options.getBoolean('reset') ?? false;
		const channelId = interaction.channelId ?? interaction.user.id;

		if (reset) clearChannelHistory(channelId);

		const history = getChannelHistory(channelId);
		const messages: ChatMessage[] = [...history, { role: 'user', content: prompt }];

		await interaction.deferReply();

		let lastEditAt = 0;
		const onDelta = async (text: string) => {
			const now = Date.now();
			if (now - lastEditAt < config.streamUpdateMs || !text) return;
			lastEditAt = now;
			await interaction
				.editReply({
					components: [liveContainer(text, config)],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
		};

		let answer: string;
		try {
			answer = await streamChatCompletion({ messages, config, onDelta });
		} catch (error) {
			if (error instanceof ChatServiceError) {
				throw new UserError({
					identifier: error.identifier,
					message: `❌ ${error.message}`,
					context: { ephemeral: true }
				});
			}
			throw error;
		}

		if (!answer) {
			throw new UserError({
				identifier: 'chat_empty_response',
				message: '❌ AI가 빈 답장을 보냈어요. 잠시 후 다시 시도해 주세요.',
				context: { ephemeral: true }
			});
		}

		pushChannelHistory(channelId, { role: 'user', content: prompt }, { role: 'assistant', content: answer });
		const turnCount = Math.ceil(getChannelHistory(channelId).length / 2);

		await interaction.editReply({
			components: [finalContainer(answer, config, turnCount)],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { parse: [] }
		});
	}
}
