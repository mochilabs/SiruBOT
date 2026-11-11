import { notice } from '../view/notice.ts';
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js';
import { emoji } from '@sirubot/utils';
import type { TtsUserSettingsService } from '../../../services/ttsUserSettings.ts';
import { normalizeTtsChannel, normalizeTtsEmotion } from '../../../services/ttsUserSettings.ts';
import { buildTtsPanel, normalizePanelLang, TTS_VOICE_DEFAULT_VALUE } from '../view/ttsView.ts';
import { ttsId } from '../customIds.ts';

/**
 * /tts 패널의 음성·위치 셀렉트 핸들러. 선택한 음성을 저장하고 패널을 다시 그려 현재 선택을 표시한다.
 * "기본 음성"을 고르면 저장된 음성을 지워 봇 기본 음성으로 되돌린다.
 */
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
		// 언어 셀렉트는 저장할 값이 없다 — 보는 언어만 바꿔 패널을 다시 그린다
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
