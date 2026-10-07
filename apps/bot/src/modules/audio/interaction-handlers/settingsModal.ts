import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, ModalSubmitInteraction } from 'discord.js';
import { settingsView } from '../view/settings.ts';
import { checkManageGuild } from '../utils/permissionCheck.ts';
import { errorView } from '../view/error.ts';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class SettingsModalHandler extends InteractionHandler {
	public override parse(interaction: ModalSubmitInteraction) {
		if (interaction.customId !== 'settings:jtc-template') return this.none();
		return this.some();
	}

	public override async run(interaction: ModalSubmitInteraction) {
		if (!interaction.inCachedGuild()) return;

		if (!checkManageGuild(interaction.member)) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('⚙️ 서버 설정은 서버 관리 권한이 있는 멤버만 변경할 수 있어요.')]
			});
			return;
		}

		const template = interaction.fields.getTextInputValue('settings:jtc-template-input').trim();
		if (!template) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView('❌ 방 이름 템플릿을 입력해 주세요.')]
			});
			return;
		}

		await this.container.guildService.setJtcTemplate(interaction.guildId, template.slice(0, 100));
		await interaction.deferUpdate();

		const guild = await this.container.guildService.getGuild(interaction.guildId);
		await interaction.editReply({
			components: [settingsView(guild, 'jtc')],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}
}
