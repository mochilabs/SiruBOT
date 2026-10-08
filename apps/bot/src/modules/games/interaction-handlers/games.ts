import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { emoji, createContainer } from '@sirubot/utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, type ButtonInteraction } from 'discord.js';
import { rpsChoiceContainer, rpsLabels } from '../commands/rps.ts';
import { getRpsStats, recordGameResult, type GameResult } from '../utils/gameRecords.ts';

const RPS_ICONS = ['✌️', '✊', '🖐'];

/** outcome: 0 = 비김, 1 = 승, 2 = 패 — 표시할 연승 문구가 있으면 반환 */
async function resolveStreakLine(userId: string, outcome: number): Promise<string | null> {
	const before = await getRpsStats(userId);
	const result: GameResult = outcome === 1 ? 'win' : outcome === 2 ? 'loss' : 'draw';
	await recordGameResult(userId, 'rps', result);

	if (outcome === 1) {
		const streak = before.streak + 1;
		const best = Math.max(before.best, streak);
		return streak >= 2 ? `${emoji('fire')} **${streak}연승 중!** (최고 ${best}연승)` : null;
	}
	if (outcome === 2) {
		const broken = before.streak >= 2 ? `${emoji('broken_heart')} ${before.streak}연승이 끊겼어요 (최고 ${before.best}연승)` : null;
		return broken;
	}
	return before.streak >= 2 ? `${emoji('fist_bump')} ${before.streak}연승 유지 중 (최고 ${before.best}연승)` : null;
}

function noticeContainer(text: string) {
	const container = createContainer();
	container.addTextDisplayComponents((t) => t.setContent(text));
	return container;
}

function rpsResultContainer(displayName: string, userPick: number, botPick: number, streakLine: string | null) {
	const outcome = (userPick - botPick + 3) % 3;
	const resultText = outcome === 0 ? `${emoji('cd')} 비겼어요!` : outcome === 1 ? `${emoji('party')} 이겼어요!` : `😭 졌어요!`;
	const resultEmoji = outcome === 0 ? emoji('fist_bump') : outcome === 1 ? emoji('smile') : '🫠';

	const lines = [
		`### ${emoji('fist')} 가위바위보 결과`,
		`**${displayName}** 님: ${RPS_ICONS[userPick]} ${rpsLabels[userPick]}`,
		`**봇**: ${RPS_ICONS[botPick]} ${rpsLabels[botPick]}`,
		'',
		`**${resultEmoji} ${resultText}**`
	];
	if (streakLine) lines.push(streakLine);

	const container = createContainer();
	container.addTextDisplayComponents((t) => t.setContent(lines.join('\n')));
	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId('game:rps:again')
				.setLabel(`다시하기 ${emoji('repeat')}`)
				.setStyle(ButtonStyle.Secondary)
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

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.customId.startsWith('game:')) return this.none();
		return this.some();
	}

	public override async run(interaction: ButtonInteraction<'cached'>) {
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
					components: [noticeContainer(`${emoji('error')} 잘못된 가위바위보 선택이에요.`)],
					flags: [MessageFlags.IsComponentsV2]
				});
				return;
			}

			const botPick = Math.floor(Math.random() * 3);
			const outcome = (userPick - botPick + 3) % 3;
			const streakLine = await resolveStreakLine(interaction.user.id, outcome);
			await interaction.editReply({
				components: [rpsResultContainer(interaction.user.displayName, userPick, botPick, streakLine)],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}
	}
}
