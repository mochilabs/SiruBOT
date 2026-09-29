import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, type ButtonInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { closePoll, polls, renderPollContainer } from '../utils/pollStore.ts';
import { rpsChoiceContainer, rpsLabels } from '../commands/rps.ts';

const RPS_ICONS = ['✊', '🖐', '✌️'];

function noticeContainer(text: string) {
	const container = createContainer();
	container.addTextDisplayComponents((t) => t.setContent(text));
	return container;
}

function rpsResultContainer(displayName: string, userPick: number, botPick: number) {
	const outcome = (userPick - botPick + 3) % 3;
	const resultText = outcome === 0 ? '💿 비겼어요!' : outcome === 1 ? '🎉 이겼어요!' : '😭 졌어요!';
	const resultEmoji = outcome === 0 ? '🤝' : outcome === 1 ? '😎' : '🫠';

	const container = createContainer();
	container.addTextDisplayComponents((t) =>
		t.setContent(
			[
				'### ✊ 가위바위보 결과',
				`**${displayName}** 님: ${RPS_ICONS[userPick]} ${rpsLabels[userPick]}`,
				`**봇**: ${RPS_ICONS[botPick]} ${rpsLabels[botPick]}`,
				'',
				`**${resultEmoji} ${resultText}**`
			].join('\n')
		)
	);
	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('game:rps:again').setLabel('다시하기 🔄').setStyle(ButtonStyle.Secondary)
		)
	);
	return container;
}

export default class GamesInteractionHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.MessageComponent
		});
	}

	public override parse(interaction: ButtonInteraction | StringSelectMenuInteraction) {
		if (!interaction.customId.startsWith('game:')) return this.none();
		return this.some();
	}

	public override async run(interaction: ButtonInteraction<'cached'> | StringSelectMenuInteraction<'cached'>) {
		const [, kind, arg] = interaction.customId.split(':');

		if (kind === 'rps') {
			await interaction.deferUpdate();

			if (arg === 'again') {
				await interaction.editReply({
					components: [rpsChoiceContainer(interaction.user.displayName)],
					flags: [MessageFlags.IsComponentsV2]
				});
				return;
			}

			const userPick = Number(arg);
			if (!Number.isInteger(userPick) || userPick < 0 || userPick > 2) {
				await interaction.editReply({
					components: [noticeContainer('❌ 잘못된 가위바위보 선택이에요.')],
					flags: [MessageFlags.IsComponentsV2]
				});
				return;
			}

			const botPick = Math.floor(Math.random() * 3);
			await interaction.editReply({
				components: [rpsResultContainer(interaction.user.displayName, userPick, botPick)],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		if (kind === 'poll') {
			const pollId = arg ?? '';
			const poll = polls.get(pollId);

			await interaction.deferUpdate();

			if (!poll || poll.closed) {
				await interaction.editReply({
					components: [noticeContainer('🔒 이 투표는 이미 마감됐어요.')],
					flags: [MessageFlags.IsComponentsV2]
				});
				return;
			}

			if (!interaction.isStringSelectMenu()) return;
			const choice = Number(interaction.values[0]);
			if (!Number.isInteger(choice) || choice < 0 || choice >= poll.options.length) return;

			poll.votes.set(interaction.user.id, choice);
			try {
				await poll.editMessage([renderPollContainer(poll, pollId)]);
			} catch {
				await closePoll(pollId);
			}
			return;
		}
	}
}
