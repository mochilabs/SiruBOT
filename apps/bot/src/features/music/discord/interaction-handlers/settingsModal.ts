import { ApplyOptions } from '@sapphire/decorators';
import { emoji, WARN_COLOR } from '@sirubot/utils';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, ModalSubmitInteraction } from 'discord.js';
import { settingsId } from '../customIds.ts';
import { settingsView, type SettingsMode } from '../views/settings.ts';
import { applyMixerToPlayer } from '../settings/mixerApply.ts';
import type { SettingsApplyResult } from '../settings/types.ts';
import { checkManageGuild } from '../utils/permissionCheck.ts';
import { errorView } from '../../../../lib/errorView.ts';
import { notice } from '../../../../lib/notice.ts';
import * as guildJtc from '../../../../services/guildSettings/jtc.ts';
import * as guildMixer from '../../../../services/guildSettings/mixer.ts';

const MODAL_ACTIONS = ['jtcTemplateModal', 'crossfadeModal', 'automixModal'] as const;
type ModalAction = (typeof MODAL_ACTIONS)[number];

function parseOptionalNumber(raw: string): number | null {
	const text = raw.trim().replace(',', '.');
	return text === '' ? null : Number(text);
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.ModalSubmit
})
export class SettingsModalHandler extends InteractionHandler {
	public override parse(interaction: ModalSubmitInteraction) {
		const action = settingsId.decode(interaction.customId)?.action;
		if (!action || !(MODAL_ACTIONS as readonly string[]).includes(action)) return this.none();
		return this.some({ action: action as ModalAction });
	}

	public override async run(interaction: ModalSubmitInteraction, { action }: { action: ModalAction }) {
		if (!interaction.inCachedGuild()) return;

		if (!checkManageGuild(interaction.member)) {
			await this.replyError(interaction, '서버 설정은 서버 관리 권한이 있는 멤버만 변경할 수 있어요.');
			return;
		}

		let screen: SettingsMode;
		let result: SettingsApplyResult = undefined;
		if (action === 'jtcTemplateModal') {
			const template = interaction.fields.getTextInputValue(settingsId.encode('jtcTemplateInput')).trim();
			if (!template) return this.replyError(interaction, '방 이름 템플릿을 입력해 주세요.');
			await guildJtc.setJtcTemplate(this.container.guildService, interaction.guildId, template.slice(0, 100));
			screen = 'jtc';
		} else if (action === 'crossfadeModal') {
			const seconds = parseOptionalNumber(interaction.fields.getTextInputValue(settingsId.encode('crossfadeInput')));
			if (seconds === null || !Number.isFinite(seconds)) return this.replyError(interaction, '겹침 시간은 숫자(0.5~15초)로 입력해 주세요.');
			try {
				const saved = await guildMixer.setCrossfadeDuration(this.container.guildService, interaction.guildId, seconds);
				result = await applyMixerToPlayer(this.container, interaction.guildId, (player) =>
					this.container.mixerService.setAutomix(player, saved)
				);
			} catch (error) {
				if (error instanceof RangeError) return this.replyError(interaction, error.message);
				throw error;
			}
			screen = 'audio';
		} else {
			const tempo = parseOptionalNumber(interaction.fields.getTextInputValue(settingsId.encode('automixTempoInput')));
			const confidence = parseOptionalNumber(interaction.fields.getTextInputValue(settingsId.encode('automixConfidenceInput')));
			if ((tempo !== null && !Number.isFinite(tempo)) || (confidence !== null && !Number.isFinite(confidence))) {
				return this.replyError(interaction, '숫자로 입력해 주세요. (최대 템포 변경 0~12, 최소 신뢰도 0~1)');
			}
			if (tempo !== null || confidence !== null) {
				try {
					const current = await guildMixer.getMixerSettings(this.container.guildService, interaction.guildId);
					const saved = await guildMixer.setAutomix(
						this.container.guildService,
						interaction.guildId,
						current.automixEnabled,
						tempo === null ? undefined : tempo / 100,
						confidence ?? undefined
					);
					result = await applyMixerToPlayer(this.container, interaction.guildId, (player) =>
						this.container.mixerService.setAutomix(player, saved)
					);
				} catch (error) {
					if (error instanceof RangeError) return this.replyError(interaction, error.message);
					throw error;
				}
			}
			screen = 'audio';
		}

		await interaction.deferUpdate();

		const guild = await this.container.guildService.getGuild(interaction.guildId);
		await interaction.editReply({
			components: [settingsView(guild, screen, { channelId: interaction.channelId ?? undefined })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});

		if (result) {
			await interaction.followUp({
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
				components: [notice(result.notice, result.warn ? WARN_COLOR : undefined)],
				allowedMentions: { parse: [] }
			});
		}
	}

	private async replyError(interaction: ModalSubmitInteraction, message: string): Promise<void> {
		await interaction.reply({
			flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
			components: [errorView(`${emoji('error')} ${message}`)]
		});
	}
}
