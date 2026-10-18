import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { buildTtsPanel, ttsModalPrefix } from '../utils/ttsView.ts';

type TtsValueAction = 'speed' | 'pitch';

const RANGES: Record<TtsValueAction, { min: number; max: number; label: string }> = {
	speed: { min: 0.25, max: 4, label: '속도는 0.25부터 4.0 사이 숫자' },
	pitch: { min: -12, max: 12, label: '피치는 -12부터 12 사이 숫자' }
};

/**
 * /tts 패널의 속도·피치 모달 제출 핸들러.
 * 입력을 비워 두면 기본값(null)으로 되돌린다. 값이 범위를 벗어나면 패널을 건드리지 않고 안내만 남긴다.
 */
@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class TtsPanelModalHandler extends InteractionHandler {
	public override parse(interaction: ModalSubmitInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		if (!interaction.customId.startsWith(ttsModalPrefix)) return this.none();
		const action = interaction.customId.slice(ttsModalPrefix.length);
		if (action !== 'speed' && action !== 'pitch') return this.none();
		return this.some({ action });
	}

	public override async run(interaction: ModalSubmitInteraction<'cached'>, { action }: { action: TtsValueAction }) {
		const raw = interaction.fields.getTextInputValue(`${ttsModalPrefix}${action}:value`).trim();

		let value: number | null = null;
		if (raw !== '') {
			const parsed = Number(raw);
			const range = RANGES[action];
			if (!Number.isFinite(parsed) || parsed < range.min || parsed > range.max) {
				await interaction.reply({
					flags: [MessageFlags.Ephemeral],
					content: `${emoji('error')} ${range.label}로 입력해 주세요. 비워 두면 기본값으로 돌아가요.`
				});
				return;
			}
			value = parsed;
		}

		const patch = action === 'speed' ? { speed: value } : { pitch: value };
		const ok = await this.container.ttsUserSettings.set(interaction.guildId, interaction.user.id, patch);
		if (!ok) {
			await interaction.reply({
				flags: [MessageFlags.Ephemeral],
				content: `${emoji('error')} 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.`
			});
			return;
		}

		await interaction.deferUpdate();
		await interaction.editReply({
			components: [await buildTtsPanel(this.container, interaction.guildId, interaction.user.id)],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { parse: [] }
		});
	}
}
