import { Events, Listener, container } from '@sapphire/framework';
import { usageFeatureKey } from '@sirubot/utils/modules';
import { MessageFlags, type Interaction } from 'discord.js';
import { customIdNamespace } from '../../lib/customId.ts';
import { gateNamespace } from '../../lib/moduleGate.ts';
import { withGuildAccent } from '../../lib/guildAccent.ts';
import { notice } from '../../lib/notice.ts';
import { isModuleEnabled } from '../../services/guildSettings/modules.ts';

/**
 * Sapphire 내장 `CoreInteractionCreate` 리스너를 같은 이름으로 대체해요 (피스 이름이 같으면 뒤에 로드한 쪽이 이겨요).
 * 라우팅은 내장과 똑같고, 버튼·셀렉트·모달에만 한 곳에서 모듈 꺼짐 검사를 더해요 (P-06).
 * 핸들러는 피스마다 따로 parse/run을 해서 다른 리스너에서는 막을 수 없기 때문에 라우터를 대신해요.
 *
 * - 꺼진 모듈의 컴포넌트는 핸들러를 부르지 않고 ephemeral 안내만 보내요. 지표(`ns:`)도 실행된 것만 세요.
 * - 도움말·온보딩 namespace와 모르는 namespace는 항상 통과해요 (`gateNamespace`).
 * - 슬래시 명령은 내장대로 PossibleChatInputCommand로 넘기고, 거절은 전역 precondition(`ModuleEnabled`)이 해요.
 */
export class CoreInteractionCreate extends Listener {
	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, { ...options, event: Events.InteractionCreate });
	}

	public override async run(interaction: Interaction) {
		// 자동완성은 컨테이너를 만들지 않으니 색 맥락 없이 바로 라우팅해요.
		if (interaction.isAutocomplete()) {
			await this.route(interaction);
			return;
		}
		// 서버 강조색을 맥락에 싣고 라우팅해요 — 이후 만들어지는 모든 컨테이너가 서버 색을 써요.
		await withGuildAccent(
			interaction.guildId,
			async (guildId) => (await this.container.guildService.getGuild(guildId)).accentColor,
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
			// 사용 지표: 버튼·셀렉트·모달은 customId namespace로 묶어요 (`ns:{namespace}`). 핸들러까지 간 것만 세요.
			if (namespace) container.usageRecorder?.record(interaction.guildId, usageFeatureKey('ns', namespace), interaction.user.id);
			await this.container.stores.get('interaction-handlers').run(interaction);
		} else {
			this.container.logger.warn(`[Sapphire ${this.location.name}] Unhandled interaction type: ${interaction.constructor.name}`);
		}
	}
}
