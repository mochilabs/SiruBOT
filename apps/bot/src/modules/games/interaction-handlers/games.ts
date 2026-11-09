import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { rpsChoiceView, rpsResultView } from '../view/rps.ts';
import { getRpsStats, recordGameResult, type GameResult } from '../utils/gameRecords.ts';
import { textContainer } from '../view/textContainer.ts';

/** outcome: 0 = 비김, 1 = 승, 2 = 패. 표시할 연승 문구가 있으면 반환 */
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
					components: [rpsChoiceView(interaction.user.displayName)],
					flags: [MessageFlags.IsComponentsV2]
				});
				return;
			}

			const userPick = Number(arg);
			if (!Number.isInteger(userPick) || userPick < 0 || userPick > 2) {
				await interaction.editReply({
					components: [textContainer([`${emoji('error')} 잘못된 가위바위보 선택이에요.`])],
					flags: [MessageFlags.IsComponentsV2]
				});
				return;
			}

			const botPick = Math.floor(Math.random() * 3);
			const outcome = (userPick - botPick + 3) % 3;
			const streakLine = await resolveStreakLine(interaction.user.id, outcome);
			await interaction.editReply({
				components: [rpsResultView(interaction.user.displayName, userPick, botPick, streakLine)],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}
	}
}
