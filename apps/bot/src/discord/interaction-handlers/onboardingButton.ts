import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { MessageFlags, PermissionFlagsBits, type ButtonInteraction } from 'discord.js';
import { openSettingsPanel } from '../../features/music/index.ts';
import { notice } from '../../lib/notice.ts';
import { onboardingId } from '../customIds.ts';
import { runHelpSession } from '../help/helpSession.ts';

type OnboardingAction = NonNullable<ReturnType<typeof onboardingId.decode>>['action'];

@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.Button })
export class OnboardingButtonHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		const action = onboardingId.decode(interaction.customId)?.action;
		return action ? this.some(action) : this.none();
	}

	public override async run(interaction: ButtonInteraction, action: OnboardingAction) {
		if (action === 'tour') {
			await runHelpSession(interaction);
			return;
		}

		if (!interaction.inCachedGuild()) {
			await interaction.reply({
				components: [notice(`${emoji('warning')} 서버 채널에서 \`/설정\`을 입력해 주세요.`)],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
			return;
		}
		if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
			await interaction.reply({
				components: [notice(`${emoji('error')} 서버 설정은 서버 관리 권한이 있는 분만 열 수 있어요.`)],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
			});
			return;
		}
		await openSettingsPanel(interaction, { ephemeral: true });
	}
}
