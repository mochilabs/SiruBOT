import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, ModalSubmitInteraction, TextDisplayBuilder } from 'discord.js';
import { createContainer } from '@sirubot/utils';
import { inspect } from 'node:util';
import { envParseArray } from '@skyra/env-utilities';

const OWNERS = envParseArray('OWNERS');

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class EvalModalHandler extends InteractionHandler {
	public override parse(interaction: ModalSubmitInteraction) {
		if (interaction.customId !== 'eval-modal') return this.none();
		return this.some();
	}

	public override async run(interaction: ModalSubmitInteraction) {
		// Owner check
		if (!OWNERS.includes(interaction.user.id)) {
			await interaction.reply({ content: '봇 소유자만 사용할 수 있어요.', ephemeral: true });
			return;
		}

		const code = interaction.fields.getTextInputValue('eval-code');
		await interaction.deferReply();

		let result: string;
		let success = true;

		try {
			// eslint-disable-next-line no-eval
			let evaled = await eval(code);
			if (typeof evaled !== 'string') {
				evaled = inspect(evaled, { depth: 2 });
			}
			result = evaled;
		} catch (error) {
			success = false;
			result = error instanceof Error ? (error.stack ?? error.message) : String(error);
		}

		// Truncate result
		if (result.length > 3800) {
			result = result.substring(0, 3800) + '\n... (truncated)';
		}

		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`### ${success ? '✅' : '❌'} Eval\n**Input:**\n\`\`\`js\n${code}\n\`\`\`\n**Output:**\n\`\`\`js\n${result}\n\`\`\``
			)
		);

		await interaction.editReply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
