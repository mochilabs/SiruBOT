import { ApplyOptions } from '@sapphire/decorators';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, TextChannel } from 'discord.js';
import { ticketPanelView } from '../view/ticket.ts';

@ApplyOptions<Subcommand.Options>({
	enabled: true,
	name: 'ticket',
	description: '고객지원 및 문의 티켓 시스템을 관리해요.',
	fullCategory: ['일반'],
	subcommands: [
		{ name: 'panel', chatInputRun: 'chatInputPanel' },
		{ name: 'close', chatInputRun: 'chatInputClose' },
		{ name: 'add', chatInputRun: 'chatInputAdd' },
		{ name: 'remove', chatInputRun: 'chatInputRemove' }
	]
})
export class TicketCommand extends Subcommand {
	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '티켓' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '고객지원 및 문의 티켓 시스템을 관리해요.' })
				.addSubcommand((sub) =>
					sub
						.setName('panel')
						.setNameLocalizations({ ko: '패널' })
						.setDescription('지정한 채널에 유저가 누를 수 있는 티켓 오픈 패널을 게시해요 (관리자 전용).')
						.addChannelOption((opt) =>
							opt.setName('channel').setNameLocalizations({ ko: '채널' }).setDescription('패널을 전송할 텍스트 채널').setRequired(false)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('close')
						.setNameLocalizations({ ko: '닫기' })
						.setDescription('현재 진행 중인 티켓을 마감하고 채널을 정리해요.')
						.addStringOption((opt) =>
							opt.setName('reason').setNameLocalizations({ ko: '사유' }).setDescription('티켓을 종료하는 사유').setRequired(false)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('add')
						.setNameLocalizations({ ko: '초대' })
						.setDescription('현재 티켓 채널에 다른 유저를 초대해요.')
						.addUserOption((opt) =>
							opt.setName('user').setNameLocalizations({ ko: '유저' }).setDescription('티켓에 참여시킬 대상 유저').setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('remove')
						.setNameLocalizations({ ko: '제외' })
						.setDescription('현재 티켓 채널에서 유저를 제외해요.')
						.addUserOption((opt) =>
							opt.setName('user').setNameLocalizations({ ko: '유저' }).setDescription('티켓에서 제외할 대상 유저').setRequired(true)
						)
				);
		});
	}

	/**
	 * /ticket panel — 패널 게시 (ManageGuild or ManageChannels 필요)
	 */
	public async chatInputPanel(interaction: ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		if (
			!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
			!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)
		) {
			await interaction.editReply({
				content: '❌ 이 명령어를 실행하려면 서버 관리(Manage Server) 또는 채널 관리(Manage Channels) 권한이 필요해요.'
			});
			return;
		}

		const targetChannel = (interaction.options.getChannel('channel') ?? interaction.channel) as TextChannel | null;
		if (!targetChannel || !targetChannel.isTextBased() || !('send' in targetChannel)) {
			await interaction.editReply({ content: '❌ 올바른 텍스트 채널을 지정해 주세요.' });
			return;
		}

		const config = await this.container.ticketService.getConfig(interaction.guildId);
		if (!config || !config.enabled) {
			await interaction.editReply({
				content: '❌ 먼저 티켓 기능이 활성화되어 있어야 해요. 대시보드 또는 설정에서 티켓을 활성화해 주세요.'
			});
			return;
		}

		try {
			const panelPayload = ticketPanelView(config);
			const message = await targetChannel.send(panelPayload);

			await this.container.db.ticketConfig.update({
				where: { guildId: interaction.guildId },
				data: {
					panelChannelId: targetChannel.id,
					panelMessageId: message.id
				}
			});

			await interaction.editReply({ content: `✅ <#${targetChannel.id}> 채널에 티켓 오픈 패널을 게시했어요.` });
		} catch (error) {
			this.container.logger.error(`[ticket] Failed to send panel in guild ${interaction.guildId}: ${error}`);
			await interaction.editReply({ content: '❌ 패널을 전송하지 못했어요. 채널 권한(메시지 전송)을 확인해 주세요.' });
		}
	}

	/**
	 * /ticket close — 현재 티켓 닫기
	 */
	public async chatInputClose(interaction: ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		const reason = interaction.options.getString('reason') ?? undefined;

		const result = await this.container.ticketService.closeTicket(interaction.guild, interaction.channelId, interaction.member, reason);

		if (!result.ok) {
			await interaction.editReply({ content: `❌ ${result.reason}` });
			return;
		}

		await interaction.editReply({ content: '✅ 티켓이 닫혔어요.' });
	}

	/**
	 * /ticket add — 유저 추가
	 */
	public async chatInputAdd(interaction: ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		const user = interaction.options.getUser('user', true);

		const result = await this.container.ticketService.modifyMemberAccess(
			interaction.guild,
			interaction.channelId,
			user.id,
			'add',
			interaction.member
		);

		if (!result.ok) {
			await interaction.editReply({ content: `❌ ${result.reason}` });
			return;
		}

		await interaction.editReply({ content: `✅ <@${user.id}> 님을 티켓에 초대했어요.` });
	}

	/**
	 * /ticket remove — 유저 제외
	 */
	public async chatInputRemove(interaction: ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		const user = interaction.options.getUser('user', true);

		const result = await this.container.ticketService.modifyMemberAccess(
			interaction.guild,
			interaction.channelId,
			user.id,
			'remove',
			interaction.member
		);

		if (!result.ok) {
			await interaction.editReply({ content: `❌ ${result.reason}` });
			return;
		}

		await interaction.editReply({ content: `✅ <@${user.id}> 님을 티켓에서 제외했어요.` });
	}
}
