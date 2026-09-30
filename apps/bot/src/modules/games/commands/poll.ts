import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { randomBytes } from 'node:crypto';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { closePoll, polls, renderPollContainer, type PollState } from '../utils/pollStore.ts';

const DURATION_CHOICES: { label: string; value: string; seconds: number }[] = [
	{ label: '1분', value: '60', seconds: 60 },
	{ label: '5분', value: '300', seconds: 300 },
	{ label: '10분', value: '600', seconds: 600 },
	{ label: '30분', value: '1800', seconds: 1800 },
	{ label: '1시간', value: '3600', seconds: 3600 },
	{ label: '무기한', value: '0', seconds: 0 }
];

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'poll',
	description: '버튼으로 투표를 받아요. 기간이 지나면 자동 마감돼요.',
	fullCategory: ['일반']
})
export class PollCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '투표' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '버튼으로 투표를 받아요. 기간이 지나면 자동 마감돼요.' })
				.addStringOption((option) =>
					option
						.setName('질문')
						.setNameLocalizations({ ko: '질문', 'en-US': 'question' })
						.setDescription('투표할 질문을 입력해요.')
						.setDescriptionLocalizations({ ko: '투표할 질문을 입력해요.' })
						.setRequired(true)
						.setMaxLength(200)
				)
				.addStringOption((option) =>
					option
						.setName('선택지')
						.setNameLocalizations({ ko: '선택지', 'en-US': 'options' })
						.setDescription('쉼표로 구분한 선택지 2~10개 (예: 김치피자, 치즈피자)')
						.setDescriptionLocalizations({ ko: '쉼표로 구분한 선택지 2~10개 (예: 김치피자, 치즈피자)' })
						.setRequired(true)
						.setMaxLength(500)
				)
				.addStringOption((option) =>
					option
						.setName('기간')
						.setNameLocalizations({ ko: '기간', 'en-US': 'duration' })
						.setDescription('투표 마감 시간을 선택해요.')
						.setDescriptionLocalizations({ ko: '투표 마감 시간을 선택해요.' })
						.setRequired(false)
						.addChoices(...DURATION_CHOICES.map(({ label, value }) => ({ name: label, value })))
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'poll_not_in_guild',
				message: '❌ 길드 안에서만 사용할 수 있어요.',
				context: { ephemeral: true }
			});
		}

		const question = interaction.options.getString('질문', true).trim();
		const options = interaction.options
			.getString('선택지', true)
			.split(/[,，]/)
			.map((s) => s.trim())
			.filter(Boolean)
			.map((o) => o.slice(0, 100));

		if (options.length < 2 || options.length > 10) {
			throw new UserError({
				identifier: 'poll_option_count',
				message: '❌ 선택지는 쉼표로 구분해 2~10개로 입력해 주세요.',
				context: { ephemeral: true }
			});
		}

		const durationValue = interaction.options.getString('기간') ?? '600';
		const seconds = DURATION_CHOICES.find((c) => c.value === durationValue)?.seconds ?? 600;
		const pollId = randomBytes(4).toString('hex');

		const poll: PollState = {
			guildId: interaction.guildId,
			channelId: interaction.channelId,
			messageId: '',
			editMessage: async () => undefined,
			question,
			options,
			creatorName: interaction.user.displayName,
			votes: new Map(),
			endsAt: seconds > 0 ? Date.now() + seconds * 1000 : null,
			closed: false,
			timer: null
		};

		await interaction.deferReply();
		const message = await interaction.editReply({
			components: [renderPollContainer(poll, pollId)],
			flags: [MessageFlags.IsComponentsV2]
		});

		poll.messageId = message.id;
		poll.editMessage = async (components) => {
			await message.edit({ components, flags: [MessageFlags.IsComponentsV2] });
		};
		polls.set(pollId, poll);

		if (seconds > 0) {
			poll.timer = setTimeout(() => {
				void closePoll(pollId);
			}, seconds * 1000);
		}
	}
}
