import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, type ButtonInteraction } from 'discord.js';
import { rpsChoiceContainer, rpsLabels } from '../commands/rps.ts';

const RPS_ICONS = ['✊', '🖐', '✌️'];

interface RpsRecord {
	streak: number;
	best: number;
}

const rpsRecords = new Map<string, RpsRecord>();

/** outcome: 0 = 비김, 1 = 승, 2 = 패 — 표시할 연승 문구가 있으면 반환 */
function updateStreak(userId: string, outcome: number): string | null {
	let record = rpsRecords.get(userId);
	if (!record) {
		record = { streak: 0, best: 0 };
		rpsRecords.set(userId, record);
	}

	if (outcome === 1) {
		record.streak += 1;
		if (record.streak > record.best) record.best = record.streak;
		return record.streak >= 2 ? `🔥 **${record.streak}연승 중!** (최고 ${record.best}연승)` : null;
	}
	if (outcome === 2) {
		const broken = record.streak >= 2 ? `💔 ${record.streak}연승이 끊겼어요 (최고 ${record.best}연승)` : null;
		record.streak = 0;
		return broken;
	}
	return record.streak >= 2 ? `🤝 ${record.streak}연승 유지 중 (최고 ${record.best}연승)` : null;
}

function noticeContainer(text: string) {
	const container = createContainer();
	container.addTextDisplayComponents((t) => t.setContent(text));
	return container;
}

function rpsResultContainer(displayName: string, userPick: number, botPick: number, streakLine: string | null) {
	const outcome = (userPick - botPick + 3) % 3;
	const resultText = outcome === 0 ? '💿 비겼어요!' : outcome === 1 ? '🎉 이겼어요!' : '😭 졌어요!';
	const resultEmoji = outcome === 0 ? '🤝' : outcome === 1 ? '😎' : '🫠';

	const lines = [
		'### ✊ 가위바위보 결과',
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
					components: [noticeContainer('❌ 잘못된 가위바위보 선택이에요.')],
					flags: [MessageFlags.IsComponentsV2]
				});
				return;
			}

			const botPick = Math.floor(Math.random() * 3);
			const outcome = (userPick - botPick + 3) % 3;
			const streakLine = updateStreak(interaction.user.id, outcome);
			await interaction.editReply({
				components: [rpsResultContainer(interaction.user.displayName, userPick, botPick, streakLine)],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}
	}
}
