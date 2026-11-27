import { Events, Listener, container } from '@sapphire/framework';
import { usageFeatureKey } from '@sirubot/utils/modules';
import { MessageFlags, type Interaction } from 'discord.js';
import { customIdNamespace } from '../../lib/customId.ts';
import { gateNamespace } from '../../lib/moduleGate.ts';
import { withGuildTheme } from '../../lib/guildTheme.ts';
import { notice } from '../../lib/notice.ts';
import { isModuleEnabled } from '../../services/guildSettings/modules.ts';

// Sapphire 내장 CoreInteractionCreate를 같은 이름으로 대체해 버튼·셀렉트·모달의 모듈 꺼짐 검사를 한 곳에서 처리해요.
export class CoreInteractionCreate extends Listener {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: Events.InteractionCreate });
	}

	public override async run(interaction: Interaction) {
		if (interaction.isAutocomplete()) {
			await this.route(interaction);
			return;
		}
		await withGuildTheme(
			interaction.guildId,
			async (guildId) => (await this.container.guildService.getGuild(guildId)).themePreset,
			() => this.route(interaction)
		);
	}

	private async route(interaction: Interaction) {
		if (interaction.isChatInputCommand()) {
			this.container.client.emit(Events.PossibleChatInputCommand, interaction);
		} else if (interaction.isContextMenuCommand()) {
			this.container.client.emit(Events.PossibleContextMenuCommand, interaction);
		} else if (interaction.isAutocomplete()) {
			this.container.client.emit(Events.PossibleAutocompleteInteraction, interaction);
		} else if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
			const namespace = customIdNamespace(interaction.customId);
			const gate = await gateNamespace(namespace, (moduleId) => isModuleEnabled(this.container.guildService, interaction.guildId, moduleId));
			if (!gate.allowed) {
				await interaction
					.reply({
						components: [notice(gate.message)],
						flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
						allowedMentions: { parse: [] }
					})
					.catch((error: unknown) => container.logger.warn(`[module-gate] 거절 응답 실패 (${interaction.customId}): ${String(error)}`));
				return;
			}
			if (namespace) container.usageRecorder?.record(interaction.guildId, usageFeatureKey('ns', namespace), interaction.user.id);
			await this.container.stores.get('interaction-handlers').run(interaction);
		} else {
			this.container.logger.warn(`[Sapphire ${this.location.name}] Unhandled interaction type: ${interaction.constructor.name}`);
		}
	}
}
