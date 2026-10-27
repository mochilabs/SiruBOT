import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { textContainer } from '../utils/textContainer.ts';

/**
 * `2d20+3` / `d20` / `20` 표기 → { count, sides, modifier }.
 * count를 생략한 `d20`은 1개로 본다 — 초보자가 가장 먼저 시도하는 표기예요.
 */
const FORMULA_PATTERN = /^(\d{1,2})?d(\d{1,3})(?:\s*([+-])\s*(\d{1,3}))?$/i;

const MAX_COUNT = 20;
const MAX_SIDES = 1000;
const MAX_MODIFIER = 100;

interface DiceRoll {
	count: number;
	sides: number;
	modifier: number;
}

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'dice',
	description: '주사위를 굴려요. 기본은 1d6이고, 개수·면·보정을 옵션으로 지정할 수 있어요.',
	fullCategory: ['게임']
})
export class DiceCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '주사위' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '주사위를 굴려요. 기본은 1d6이고, 개수·면·보정을 옵션으로 지정할 수 있어요.' })
				.addIntegerOption((option) =>
					option
						.setName('count')
						.setNameLocalizations({ ko: '개수' })
						.setDescription('Number of dice to roll (1-20).')
						.setDescriptionLocalizations({ ko: `굴릴 주사위 개수 (1~${MAX_COUNT})` })
						.setMinValue(1)
						.setMaxValue(MAX_COUNT)
						.setRequired(false)
				)
				.addIntegerOption((option) =>
					option
						.setName('sides')
						.setNameLocalizations({ ko: '면' })
						.setDescription('Faces per die (2-1000).')
						.setDescriptionLocalizations({ ko: `주사위 면 수 (2~${MAX_SIDES}, 기본 6)` })
						.setMinValue(2)
						.setMaxValue(MAX_SIDES)
						.setRequired(false)
				)
				.addIntegerOption((option) =>
					option
						.setName('modifier')
						.setNameLocalizations({ ko: '보정' })
						.setDescription('Added to the total (e.g. -2).')
						.setDescriptionLocalizations({ ko: '합계에 더할 보정값 (예: -2)' })
						.setMinValue(-MAX_MODIFIER)
						.setMaxValue(MAX_MODIFIER)
						.setRequired(false)
				)
				.addStringOption((option) =>
					option
						.setName('formula')
						.setNameLocalizations({ ko: '식' })
						.setDescription('Dice formula (e.g. 2d20+3, d20). Overrides count/sides/modifier.')
						.setDescriptionLocalizations({ ko: '주사위식 (예: 2d20+3, d20). 지정하면 개수·면·보정보다 우선해요.' })
						.setRequired(false)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const roll = this.resolveRoll(interaction);

		await interaction.deferReply();

		const rolls = Array.from({ length: roll.count }, () => Math.floor(Math.random() * roll.sides) + 1);
		const sum = rolls.reduce((acc, value) => acc + value, 0);
		const total = sum + roll.modifier;

		const modifierText = roll.modifier === 0 ? '' : ` ${roll.modifier > 0 ? '+' : '−'} ${Math.abs(roll.modifier)}`;
		const displayFormula = `${roll.count}d${roll.sides}${roll.modifier === 0 ? '' : `${roll.modifier > 0 ? '+' : '-'}${Math.abs(roll.modifier)}`}`;

		await interaction.editReply({
			components: [
				textContainer([
					`### ${emoji('dice')} 주사위 굴림`,
					`**${displayFormula}** → \`${rolls.join(' + ')}\`${modifierText} = **${total}**`,
					`-# ${interaction.user.displayName} 님이 굴렸어요.`
				])
			],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	/** 식이 있으면 식이 우선하고, 없으면 개별 옵션(기본 1d6)으로 조립해요 */
	private resolveRoll(interaction: ChatInputCommandInteraction): DiceRoll {
		const formula = interaction.options.getString('formula')?.trim();

		if (formula) {
			const match = FORMULA_PATTERN.exec(formula);
			if (!match) {
				throw new UserError({
					identifier: 'dice_invalid_formula',
					message: `${emoji('error')} 주사위식을 이해하지 못했어요. \`2d20+3\`, \`d20\`, \`1d6\` 같은 형식으로 입력해 주세요.`,
					context: { ephemeral: true }
				});
			}

			const roll: DiceRoll = {
				count: match[1] ? Number(match[1]) : 1,
				sides: Number(match[2]),
				modifier: match[3] ? (match[3] === '-' ? -1 : 1) * Number(match[4] ?? 0) : 0
			};
			this.assertRange(roll);
			return roll;
		}

		const roll: DiceRoll = {
			count: interaction.options.getInteger('count') ?? 1,
			sides: interaction.options.getInteger('sides') ?? 6,
			modifier: interaction.options.getInteger('modifier') ?? 0
		};
		this.assertRange(roll);
		return roll;
	}

	private assertRange(roll: DiceRoll): void {
		if (roll.count < 1 || roll.count > MAX_COUNT || roll.sides < 2 || roll.sides > MAX_SIDES || Math.abs(roll.modifier) > MAX_MODIFIER) {
			throw new UserError({
				identifier: 'dice_out_of_range',
				message: `${emoji('error')} 주사위는 \`1~${MAX_COUNT}\`개, 면은 \`2~${MAX_SIDES}\` 사이, 보정은 \`±${MAX_MODIFIER}\`까지 가능해요.`,
				context: { ephemeral: true }
			});
		}
	}
}
