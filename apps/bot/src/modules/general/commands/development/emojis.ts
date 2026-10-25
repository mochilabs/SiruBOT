import { ApplyOptions } from '@sapphire/decorators';
import { Command, RegisterBehavior } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, ContainerBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { DEFAULT_COLOR, emoji } from '@sirubot/utils';
import { envParseArray } from '@skyra/env-utilities';
import type { AppEmojiManager } from '../../../../services/appEmojiManager.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'emojis',
	fullCategory: ['개발'],
	preconditions: ['OwnerOnly']
})
export class EmojisCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand(
			(builder: SlashCommandBuilder) => {
				builder
					.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
					.setName(this.name)
					.setNameLocalizations({ ko: '이모지' })
					.setDescription('앱 이모지를 관리해요. (봇 소유자 전용)')
					.setDescriptionLocalizations({ ko: '앱 이모지를 조회·동기화·전체 재업로드해요. (봇 소유자 전용)' })
					.addSubcommand((sub) => sub.setName('list').setDescription('등록된 앱 이모지 목록을 보여요.'))
					.addSubcommand((sub) => sub.setName('sync').setDescription('미등록 PNG를 업로드하고 캐시를 갱신해요.'))
					.addSubcommand((sub) => sub.setName('reupload').setDescription('전체 이모지를 삭제 후 재업로드해요 (ID 갱신).'));
			},
			{ guildIds: envParseArray('DEV_GUILD_IDS'), behaviorWhenNotIdentical: RegisterBehavior.Overwrite }
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		const manager = this.container.appEmojiManager;
		if (!manager) {
			await interaction.editReply({ content: `${emoji('error')} 이모지 매니저가 아직 초기화되지 않았어요.` });
			return;
		}
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'list') return this.handleList(interaction, manager);
		if (subcommand === 'sync') return this.handleSync(interaction, manager);
		if (subcommand === 'reupload') return this.handleReupload(interaction, manager);
	}

	private async handleList(interaction: ChatInputCommandInteraction, manager: AppEmojiManager) {
		try {
			const emojis = await manager.list();
			const lines = emojis.map((e) => `${e.name} — \`${e.id}\``);
			const content = [`### ${emoji('info')} 앱 이모지 ${emojis.length}개`, ...lines].join('\n');
			await interaction.editReply({
				components: [
					new ContainerBuilder().setAccentColor(DEFAULT_COLOR).addTextDisplayComponents((t) => t.setContent(content.slice(0, 3900)))
				],
				flags: [MessageFlags.IsComponentsV2]
			});
		} catch (error) {
			await interaction.editReply({ content: `${emoji('error')} 조회 실패: ${error instanceof Error ? error.message : String(error)}` });
		}
	}

	private async handleSync(interaction: ChatInputCommandInteraction, manager: AppEmojiManager) {
		try {
			await manager.sync(true);
			await interaction.editReply({ content: `${emoji('success')} 동기화 완료 — 미등록 PNG 업로드 및 캐시 갱신됨.` });
		} catch (error) {
			await interaction.editReply({ content: `${emoji('error')} 동기화 실패: ${error instanceof Error ? error.message : String(error)}` });
		}
	}

	private async handleReupload(interaction: ChatInputCommandInteraction, manager: AppEmojiManager) {
		try {
			const { created, failed } = await manager.forceReupload();
			await interaction.editReply({
				components: [
					new ContainerBuilder()
						.setAccentColor(DEFAULT_COLOR)
						.addTextDisplayComponents((t) =>
							t.setContent(`### ${emoji('success')} 전체 재업로드 완료\n신규 ${created}개 / 실패 ${failed}개 — ID 갱신됨`)
						)
				],
				flags: [MessageFlags.IsComponentsV2]
			});
		} catch (error) {
			await interaction.editReply({ content: `${emoji('error')} 재업로드 실패: ${error instanceof Error ? error.message : String(error)}` });
		}
	}
}
