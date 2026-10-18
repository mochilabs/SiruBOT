import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { buildTtsPanel, ttsVoiceSelectCustomId, TTS_VOICE_DEFAULT_VALUE } from '../utils/ttsView.ts';

/**
 * /tts 패널의 음성 셀렉트 핸들러. 선택한 음성을 저장하고 패널을 다시 그려 현재 선택을 표시한다.
 * "기본 음성"을 고르면 저장된 음성을 지워 봇 기본 음성으로 되돌린다.
 */
@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.SelectMenu
})
export class TtsPanelSelectHandler extends InteractionHandler {
	public override parse(interaction: StringSelectMenuInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		if (interaction.customId !== ttsVoiceSelectCustomId) return this.none();
		return this.some({ voice: interaction.values[0] });
	}

	public override async run(interaction: StringSelectMenuInteraction<'cached'>, { voice }: { voice: string }) {
		const { guildId, user } = interaction;
		const ok = await this.container.ttsUserSettings.set(guildId, user.id, {
			voice: voice === TTS_VOICE_DEFAULT_VALUE ? null : voice
		});
		if (!ok) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral],
				content: `${emoji('error')} 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.`
			});
			return;
		}
		await interaction.update({
			components: [await buildTtsPanel(this.container, guildId, user.id)],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { parse: [] }
		});
	}
}
