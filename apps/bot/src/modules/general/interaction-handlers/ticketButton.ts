import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, MessageFlags } from 'discord.js';
import { TICKET_OPEN_CUSTOM_ID, TICKET_CLOSE_CUSTOM_ID, TICKET_CLAIM_CUSTOM_ID, TICKET_CONFIRM_CLOSE_CUSTOM_ID } from '@sirubot/utils/ticket';
import { ticketCloseConfirmView } from '../view/ticket.ts';

export default class TicketButtonHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.Button
		});
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		const customId = interaction.customId;
		if (
			customId === TICKET_OPEN_CUSTOM_ID ||
			customId === TICKET_CLOSE_CUSTOM_ID ||
			customId === TICKET_CLAIM_CUSTOM_ID ||
			customId === TICKET_CONFIRM_CLOSE_CUSTOM_ID
		) {
			return this.some({ action: customId });
		}
		return this.none();
	}

	public async run(interaction: ButtonInteraction<'cached'>, { action }: { action: string }) {
		const ticketService = this.container.ticketService;
		const guild = interaction.guild;
		const member = interaction.member;

		switch (action) {
			case TICKET_OPEN_CUSTOM_ID: {
				await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
				const result = await ticketService.createTicket(guild, member);
				if (!result.ok) {
					await interaction.editReply({
						content: `❌ ${result.reason}`
					});
					return;
				}
				await interaction.editReply({
					content: `✅ 티켓 채널이 개설되었어요: <#${result.channel.id}>`
				});
				return;
			}

			case TICKET_CLOSE_CUSTOM_ID: {
				// 확인 프롬프트 전송
				const confirmPayload = ticketCloseConfirmView();
				await interaction.reply(confirmPayload);
				return;
			}

			case TICKET_CONFIRM_CLOSE_CUSTOM_ID: {
				await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
				const result = await ticketService.closeTicket(guild, interaction.channelId, member);
				if (!result.ok) {
					await interaction.editReply({
						content: `❌ ${result.reason}`
					});
					return;
				}
				await interaction.editReply({
					content: '✅ 티켓이 성공적으로 닫혔어요.'
				});
				return;
			}

			case TICKET_CLAIM_CUSTOM_ID: {
				await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
				const result = await ticketService.toggleClaim(guild, interaction.channelId, member);
				if (!result.ok) {
					await interaction.editReply({
						content: `❌ ${result.reason}`
					});
					return;
				}
				const isClaimed = Boolean(result.ticket.claimedById);
				await interaction.editReply({
					content: isClaimed ? '✅ 이 티켓의 담당자로 등록되었어요.' : '✅ 티켓 담당을 해제했어요.'
				});
				return;
			}
		}
	}
}
