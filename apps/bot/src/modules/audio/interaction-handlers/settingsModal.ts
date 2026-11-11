import { ApplyOptions } from '@sapphire/decorators';
import { emoji } from '@sirubot/utils';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, ModalSubmitInteraction } from 'discord.js';
import { settingsId } from '../customIds.ts';
import { settingsView } from '../view/settings.ts';
import { checkManageGuild } from '../utils/permissionCheck.ts';
import { errorView } from '../../../lib/errorView.ts';
import * as guildJtc from '../../../services/guildSettings/jtc.ts';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class SettingsModalHandler extends InteractionHandler {
	public override parse(interaction: ModalSubmitInteraction) {
		if (settingsId.decode(interaction.customId)?.action !== 'jtcTemplateModal') return this.none();
		return this.some();
	}

	public override async run(interaction: ModalSubmitInteraction) {
		if (!interaction.inCachedGuild()) return;

		if (!checkManageGuild(interaction.member)) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 서버 설정은 서버 관리 권한이 있는 멤버만 변경할 수 있어요.`)]
			});
			return;
		}

		const template = interaction.fields.getTextInputValue(settingsId.encode('jtcTemplateInput')).trim();
		if (!template) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [errorView(`${emoji('error')} 방 이름 템플릿을 입력해 주세요.`)]
			});
			return;
		}

		await guildJtc.setJtcTemplate(this.container.guildService, interaction.guildId, template.slice(0, 100));
		await interaction.deferUpdate();

		const guild = await this.container.guildService.getGuild(interaction.guildId);
		await interaction.editReply({
			components: [settingsView(guild, 'jtc')],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}
}
