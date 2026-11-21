import { container } from '@sapphire/framework';
import { MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction } from 'discord.js';
import { settingsView } from './views/settings.ts';

/**
 * 서버 설정 패널(`/설정` 첫 화면)을 열어요. `/설정`과 온보딩 "서버 설정 시작" 버튼이 같이 써요.
 * 권한(ManageGuild) 확인은 호출하는 쪽이 해요. 패널의 후속 클릭은 `interaction-handlers/settings.ts`가 `update`로 처리해서
 * ephemeral로 연 패널도 그대로 동작해요.
 */
export async function openSettingsPanel(
	interaction: ChatInputCommandInteraction<'cached'> | ButtonInteraction<'cached'>,
	options: { ephemeral: boolean }
): Promise<void> {
	await interaction.deferReply(options.ephemeral ? { flags: MessageFlags.Ephemeral } : undefined);
	const guild = await container.guildService.getGuild(interaction.guildId);
	await interaction.editReply({
		components: [settingsView(guild, 'main')],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { roles: [], users: [] }
	});
}
