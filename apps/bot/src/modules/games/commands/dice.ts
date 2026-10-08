import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { appEmoji, createContainer } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';

const FORMULA_PATTERN = /^(\d{1,2})d(\d{1,3})(?:\s*([+-])\s*(\d{1,3}))?$/i;

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'dice',
	description: '주사위를 굴려요. 기본은 1d6, 2d20+3 같은 식도 돼요.',
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
				.setDescriptionLocalizations({ ko: '주사위를 굴려요. 기본은 1d6, 2d20+3 같은 식도 돼요.' })
				.addStringOption((option) =>
					option
						.setName('식')
						.setNameLocalizations({ ko: '식', 'en-US': 'formula' })
						.setDescription('주사위식 (예: 2d20+3). 비우면 1d6으로 굴려요.')
						.setDescriptionLocalizations({ ko: '주사위식 (예: 2d20+3). 비우면 1d6으로 굴려요.' })
						.setRequired(false)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const formula = (interaction.options.getString('식') ?? '1d6').trim();
		const match = FORMULA_PATTERN.exec(formula);

		if (!match) {
			throw new UserError({
				identifier: 'dice_invalid_formula',
				message: `${appEmoji('error', '❌')} 주사위식을 이해하지 못했어요. \`2d20+3\`, \`1d6\` 같은 형식으로 입력해 주세요.`,
				context: { ephemeral: true }
			});
		}

		const count = Number(match[1]);
		const sides = Number(match[2]);
		const modifier = match[3] ? (match[3] === '-' ? -1 : 1) * Number(match[4] ?? 0) : 0;

		if (count < 1 || count > 20 || sides < 2 || sides > 1000) {
			throw new UserError({
				identifier: 'dice_out_of_range',
				message: `${appEmoji('error', '❌')} 주사위는 \`1~20\`개, 면은 \`2~1000\` 사이로 설정할 수 있어요.`,
				context: { ephemeral: true }
			});
		}

		const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
		const sum = rolls.reduce((acc, v) => acc + v, 0);
		const total = sum + modifier;

		const rollsText = rolls.join(' + ');
		const modifierText = modifier === 0 ? '' : ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}`;
		const displayFormula = `${count}d${sides}${modifier === 0 ? '' : `${modifier > 0 ? '+' : '-'}${Math.abs(modifier)}`}`;

		await interaction.deferReply();
		await interaction.editReply({
			components: [
				(() => {
					const container = createContainer();
					container.addTextDisplayComponents((t) =>
						t.setContent(
							[
								`### ${appEmoji('dice', '🎲')} 주사위 굴림`,
								`**${displayFormula}** → \`${rollsText}\`${modifierText} = **${total}**`,
								`-# ${interaction.user.displayName} 님이 굴렸어요.`
							].join('\n')
						)
					);
					return container;
				})()
			],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
