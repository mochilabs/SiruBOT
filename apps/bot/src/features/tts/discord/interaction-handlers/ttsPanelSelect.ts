import { notice } from '../../../../lib/notice.ts';
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { emoji } from '@sirubot/utils';
import type { TtsUserSettingsService } from '../../application/ttsUserSettings.ts';
import { normalizeTtsChannel, normalizeTtsEmotion } from '../../application/ttsUserSettings.ts';
import { buildTtsPanel, normalizePanelLang, TTS_VOICE_DEFAULT_VALUE } from '../views/ttsView.ts';
import { ttsId } from '../customIds.ts';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.SelectMenu
})
export class TtsPanelSelectHandler extends InteractionHandler {
	public override parse(interaction: StringSelectMenuInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		const value = interaction.values[0];
		const decoded = ttsId.decode(interaction.customId);
		if (!decoded) return this.none();
		const lang = normalizePanelLang(decoded.lang);
		if (decoded.action === 'lang') return this.some({ patch: null, lang: value });
		if (decoded.action === 'voice') return this.some({ patch: { voice: value === TTS_VOICE_DEFAULT_VALUE ? null : value }, lang });
		if (decoded.action === 'channel') return this.some({ patch: { channel: normalizeTtsChannel(value) }, lang });
		if (decoded.action === 'emotion') return this.some({ patch: { emotion: normalizeTtsEmotion(value) }, lang });
		return this.none();
	}

	public override async run(
		interaction: StringSelectMenuInteraction<'cached'>,
		{ patch, lang }: { patch: Parameters<TtsUserSettingsService['set']>[2] | null; lang: string }
	) {
		const { guildId, user } = interaction;
		await interaction.deferUpdate();
		const ok = patch ? await this.container.ttsUserSettings.set(guildId, user.id, patch) : true;
		if (!ok) {
			await interaction.followUp({
				flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
				components: [notice(`${emoji('error')} 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.`)]
			});
			return;
		}
		await interaction.editReply({
			components: [await buildTtsPanel(this.container, guildId, user.id, interaction.channelId, lang)],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { parse: [] }
		});
	}
}
