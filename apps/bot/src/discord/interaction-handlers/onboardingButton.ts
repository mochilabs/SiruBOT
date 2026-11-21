import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { MessageFlags, PermissionFlagsBits, type ButtonInteraction } from 'discord.js';
import { openSettingsPanel } from '../../features/music/index.ts';
import { notice } from '../../lib/notice.ts';
import { onboardingId } from '../customIds.ts';
import { runHelpSession } from '../help/helpSession.ts';

type OnboardingAction = NonNullable<ReturnType<typeof onboardingId.decode>>['action'];

/** 서버 가입 안내의 버튼 — 서버 설정 시작(관리자만), 기능 둘러보기(누구나). 둘 다 누른 사람에게만 보이는 ephemeral로 열어요. */
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

		// 안내는 서버 주인 DM으로 갈 수도 있어요. DM에서는 어느 서버인지 알 수 없어서 /설정으로 안내해요.
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
