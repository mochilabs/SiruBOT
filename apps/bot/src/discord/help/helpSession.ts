import { container } from '@sapphire/framework';
import type { BotModuleId } from '@sirubot/utils/modules';
import {
	MessageFlags,
	PermissionFlagsBits,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type StringSelectMenuInteraction
} from 'discord.js';
import { createComponentSession } from '../../lib/componentSession.ts';
import { getDisabledModules } from '../../services/guildSettings/modules.ts';
import { fetchCommandIndex } from '../utils/commandMentions.ts';
import { HELP_HOME, helpCategoryCustomId, helpView, parseHelpPage } from '../views/help.ts';
import type { HelpContext } from './helpCatalog.ts';

const SESSION_TIME_MS = 10 * 60_000;
const SESSION_IDLE_MS = 3 * 60_000;

/** 도움말을 여는 인터랙션: `/도움말` 또는 온보딩 "기능 둘러보기" 버튼 */
export type HelpEntryInteraction = ChatInputCommandInteraction | ButtonInteraction;

async function buildHelpContext(interaction: HelpEntryInteraction): Promise<HelpContext> {
	// 이 서버에서 꺼진 모듈은 카테고리·명령 목록에서 빼요 (P-06). DM이면 모두 보여요.
	const disabled = new Set<BotModuleId>(interaction.guildId ? await getDisabledModules(container.guildService, interaction.guildId) : []);
	return {
		isModuleEnabled: (moduleId) => !disabled.has(moduleId),
		index: await fetchCommandIndex(interaction.guildId),
		loadedCommands: new Set(container.stores.get('commands').keys()),
		canManageGuild: interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false
	};
}

/**
 * 도움말 첫 화면을 ephemeral로 보내고, 카테고리 셀렉트를 고를 때마다 같은 메시지를 다시 그려요.
 * 응답은 한 번에 완성된 화면이에요 (편집은 카테고리 전환당 1회).
 */
export async function runHelpSession(interaction: HelpEntryInteraction): Promise<void> {
	const ctx = await buildHelpContext(interaction);
	const response = await interaction.reply({
		components: [helpView(HELP_HOME, ctx)],
		flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
		allowedMentions: { parse: [] },
		withResponse: true
	});
	const message = response.resource?.message;
	if (!message) return;

	let current = parseHelpPage(HELP_HOME, ctx) ?? HELP_HOME;
	createComponentSession<StringSelectMenuInteraction>(message, {
		owner: { userId: interaction.user.id, accept: (i) => i.customId === helpCategoryCustomId },
		time: SESSION_TIME_MS,
		idle: SESSION_IDLE_MS,
		onCollect: async (selected) => {
			current = parseHelpPage(selected.values[0], ctx) ?? HELP_HOME;
			await selected.update({ components: [helpView(current, ctx)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
		},
		onTimeout: async () => {
			// 시간이 지나면 셀렉트만 빼고 마지막 화면은 남겨요
			await interaction
				.editReply({ components: [helpView(current, ctx, false)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } })
				.catch(() => undefined);
		},
		logger: container.logger
	});
}
