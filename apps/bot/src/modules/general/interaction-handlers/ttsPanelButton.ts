import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, type ButtonInteraction } from 'discord.js';
import { emoji } from '@sirubot/utils';
import type { TtsUserPreset } from '../../../services/ttsUserSettings.ts';
import { buildTtsPanel, ttsModalPrefix, ttsPanelPrefix } from '../utils/ttsView.ts';

/**
 * /tts 패널의 버튼 핸들러 — 낭독 토글, 속도/피치 모달 열기, 기본값 복구.
 * 모달 제출은 `ttsPanelModal.ts`, 음성 셀렉트는 `ttsPanelSelect.ts`가 받는다.
 */
@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button
})
export class TtsPanelButtonHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		if (!interaction.customId.startsWith(ttsPanelPrefix)) return this.none();
		return this.some({ action: interaction.customId.slice(ttsPanelPrefix.length) });
	}

	public override async run(interaction: ButtonInteraction<'cached'>, { action }: { action: string }) {
		const { guildId, user } = interaction;

		if (action === 'toggle') {
			const preset = await this.container.ttsUserSettings.get(guildId, user.id);
			await this.save(interaction, { enabled: !preset.enabled });
			return;
		}

		if (action === 'speed' || action === 'pitch') {
			const preset = await this.container.ttsUserSettings.get(guildId, user.id);
			await interaction.showModal(this.buildValueModal(action, action === 'speed' ? preset.speed : preset.pitch));
			return;
		}

		if (action === 'reset') {
			await this.save(interaction, { voice: null, speed: null, pitch: null });
		}
	}

	private async save(
		interaction: ButtonInteraction<'cached'>,
		patch: Partial<Omit<TtsUserPreset, 'enabled'>> & { enabled?: boolean }
	): Promise<void> {
		const { guildId, user } = interaction;
		const ok = await this.container.ttsUserSettings.set(guildId, user.id, patch);
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

	private buildValueModal(action: 'speed' | 'pitch', current: number | null): ModalBuilder {
		const input = new TextInputBuilder()
			.setCustomId(`${ttsModalPrefix}${action}:value`)
			.setLabel(action === 'speed' ? '속도 (0.25 ~ 4.0)' : '피치 (-12 ~ 12)')
			.setStyle(TextInputStyle.Short)
			.setRequired(false);
		if (current !== null) input.setValue(String(current));
		else input.setPlaceholder('비워 두면 기본값으로 돌아가요');

		return new ModalBuilder()
			.setCustomId(`${ttsModalPrefix}${action}`)
			.setTitle(action === 'speed' ? '낭독 속도 설정' : '낭독 음 높이 설정')
			.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
	}
}
