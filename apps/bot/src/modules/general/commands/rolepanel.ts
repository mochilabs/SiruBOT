import { ApplyOptions } from '@sapphire/decorators';
import { UserError } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { ApplicationIntegrationType, AutocompleteInteraction, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { PanelPostError } from '../../../services/rolePanelService.ts';
import { ticketMessageView } from '../../../features/tickets/index.ts';
import { respondRolePanelNames } from '../../../lib/autocomplete.ts';

/**
 * /rolepanel — 역할 패널 게시·목록·삭제 (관리자 전용).
 * 패널 생성·편집은 대시보드에서 해요. 여기선 게시(post)·목록(list)·삭제(delete)만 다뤄요.
 */
@ApplyOptions<Subcommand.Options>({
	enabled: true,
	name: 'rolepanel',
	description: '역할 패널을 관리해요.',
	fullCategory: ['일반'],
	subcommands: [
		{ name: 'post', chatInputRun: 'chatInputPost' },
		{ name: 'list', chatInputRun: 'chatInputList' },
		{ name: 'delete', chatInputRun: 'chatInputDelete' }
	]
})
export class RolePanelCommand extends Subcommand {
	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setName('rolepanel')
				.setNameLocalizations({ ko: '역할패널' })
				.setDescription('Manage role panels.')
				.setDescriptionLocalizations({ ko: '역할 패널을 관리해요.' })
				.setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
				.addSubcommand((sub) =>
					sub
						.setName('post')
						.setNameLocalizations({ ko: '게시' })
						.setDescription('Post a role panel to a channel.')
						.setDescriptionLocalizations({ ko: '지정한 채널에 역할 패널을 게시해요.' })
						.addStringOption((opt) =>
							opt
								.setName('panel')
								.setNameLocalizations({ ko: '패널' })
								.setDescription('Role panel to post.')
								.setDescriptionLocalizations({ ko: '게시할 역할 패널' })
								.setRequired(true)
								.setAutocomplete(true)
						)
						.addChannelOption((opt) =>
							opt
								.setName('channel')
								.setNameLocalizations({ ko: '채널' })
								.setDescription('Text channel to post the panel in.')
								.setDescriptionLocalizations({ ko: '패널을 전송할 텍스트 채널' })
								.setRequired(false)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('list')
						.setNameLocalizations({ ko: '목록' })
						.setDescription('List role panels in this server.')
						.setDescriptionLocalizations({ ko: '이 서버의 역할 패널 목록을 보여줘요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('delete')
						.setNameLocalizations({ ko: '삭제' })
						.setDescription('Delete a role panel.')
						.setDescriptionLocalizations({ ko: '역할 패널을 삭제해요.' })
						.addStringOption((opt) =>
							opt
								.setName('panel')
								.setNameLocalizations({ ko: '패널' })
								.setDescription('Role panel to delete.')
								.setDescriptionLocalizations({ ko: '삭제할 역할 패널' })
								.setRequired(true)
								.setAutocomplete(true)
						)
				);
		});
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction) {
		await respondRolePanelNames(interaction);
	}

	private checkManagePermission(interaction: ChatInputCommandInteraction<'cached'>) {
		if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
			throw new UserError({
				identifier: 'rolepanel_no_permission',
				message: `${emoji('error')} 이 명령어를 실행하려면 서버 관리(Manage Server) 권한이 필요해요.`,
				context: { ephemeral: true }
			});
		}
	}

	/**
	 * /rolepanel post — 역할 패널 게시. 기존 게시 메시지가 있으면 삭제 후 새로 게시해요.
	 */
	public async chatInputPost(interaction: ChatInputCommandInteraction<'cached'>) {
		this.checkManagePermission(interaction);

		const panelId = interaction.options.getString('panel', true);
		const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		try {
			// 길드 소유 검증·채널 타입 검증·이전 메시지 정리는 서비스가 한곳에서 해요 (대시보드 게시와 동일).
			const posted = await this.container.rolePanelService.publishPanel(interaction.guild, panelId, targetChannel?.id);
			await interaction.editReply(ticketMessageView(`${emoji('success')} <#${posted?.channelId}> 채널에 역할 패널을 게시했어요.`));
		} catch (error) {
			if (error instanceof PanelPostError) {
				throw new UserError({
					identifier: 'rolepanel_post_rejected',
					message: `${emoji('error')} ${error.message}`,
					context: { ephemeral: true }
				});
			}
			this.container.logger.error(`[rolepanel] Failed to post panel ${panelId} in guild ${interaction.guildId}: ${error}`);
			throw new UserError({
				identifier: 'rolepanel_post_failed',
				message: `${emoji('error')} 패널을 전송하지 못했어요. 채널 권한(메시지 전송)을 확인해 주세요.`,
				context: { ephemeral: true }
			});
		}
	}

	/**
	 * /rolepanel list — 이 서버의 역할 패널 목록.
	 */
	public async chatInputList(interaction: ChatInputCommandInteraction<'cached'>) {
		this.checkManagePermission(interaction);

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		const panels = await this.container.rolePanelService.getPanels(interaction.guildId);
		if (panels.length === 0) {
			await interaction.editReply(ticketMessageView(`${emoji('info')} 아직 역할 패널이 없어요. 대시보드에서 만들어 주세요.`));
			return;
		}

		const lines = panels.map((panel) => {
			const location = panel.channelId ? `<#${panel.channelId}>` : '미게시';
			return `- **${panel.name}** · 역할 ${panel.buttons.length}개 · ${location} · 총 ${panel.clickCount}회 클릭`;
		});

		await interaction.editReply(ticketMessageView(`### ${emoji('info')} 역할 패널 ${panels.length}개\n${lines.join('\n')}`));
	}

	/**
	 * /rolepanel delete — 역할 패널 삭제 (게시 메시지도 삭제해요).
	 */
	public async chatInputDelete(interaction: ChatInputCommandInteraction<'cached'>) {
		this.checkManagePermission(interaction);

		const panelId = interaction.options.getString('panel', true);

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		try {
			// 이 길드 소유 패널만 삭제돼요 — 다른 길드의 panelId는 '찾을 수 없음'.
			const panel = await this.container.rolePanelService.deletePanel(interaction.guild, panelId);
			if (!panel) {
				throw new UserError({
					identifier: 'rolepanel_not_found',
					message: `${emoji('error')} 역할 패널을 찾을 수 없어요.`,
					context: { ephemeral: true }
				});
			}
			await interaction.editReply(ticketMessageView(`${emoji('success')} 역할 패널 "${panel.name}"을(를) 삭제했어요.`));
		} catch (error) {
			if (error instanceof UserError) throw error;
			this.container.logger.error(`[rolepanel] Failed to delete panel ${panelId} in guild ${interaction.guildId}: ${error}`);
			throw new UserError({
				identifier: 'rolepanel_delete_failed',
				message: `${emoji('error')} 역할 패널을 삭제하지 못했어요.`,
				context: { ephemeral: true }
			});
		}
	}
}
