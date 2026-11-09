import { notice } from '../view/notice.ts';
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction } from 'discord.js';
import { emoji } from '@sirubot/utils';
import type { TtsUserPreset } from '../../../services/ttsUserSettings.ts';
import { buildTtsPanel, splitPanelLang, ttsPanelPrefix } from '../view/ttsView.ts';

/**
 * /tts 패널의 버튼 핸들러 — 낭독 토글, 기본값 복구.
 * 음성·위치 셀렉트는 `ttsPanelSelect.ts`가 받는다.
 */
@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class TtsPanelButtonHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		if (!interaction.customId.startsWith(ttsPanelPrefix)) return this.none();
		const { base, lang } = splitPanelLang(interaction.customId);
		return this.some({ action: base.slice(ttsPanelPrefix.length), lang });
	}

	public override async run(interaction: ButtonInteraction<'cached'>, { action, lang }: { action: string; lang: string }) {
		const { guildId, user } = interaction;

		if (action === 'toggle') {
			const preset = await this.container.ttsUserSettings.get(guildId, user.id);
			await this.save(interaction, { enabled: !preset.enabled }, lang);
			return;
		}

		if (action === 'reset') {
			await this.save(interaction, { voice: null, channel: 'both', emotion: 'neutral' }, lang);
		}
	}

	private async save(
		interaction: ButtonInteraction<'cached'>,
		patch: Partial<Omit<TtsUserPreset, 'enabled'>> & { enabled?: boolean },
		lang: string
	): Promise<void> {
		const { guildId, user } = interaction;
		await interaction.deferUpdate();
		const ok = await this.container.ttsUserSettings.set(guildId, user.id, patch);
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
