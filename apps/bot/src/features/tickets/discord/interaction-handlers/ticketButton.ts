import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, MessageFlags } from 'discord.js';
import { ticketId } from '../customIds.ts';
import { emoji } from '@sirubot/utils';
import { ticketCloseConfirmView, ticketMessageView } from '../views/ticket.ts';

type TicketAction = NonNullable<ReturnType<typeof ticketId.decode>>['action'];

export default class TicketButtonHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.Button
		});
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		const decoded = ticketId.decode(interaction.customId);
		return decoded ? this.some({ action: decoded.action }) : this.none();
	}

	public async run(interaction: ButtonInteraction<'cached'>, { action }: { action: TicketAction }) {
		const ticketService = this.container.ticketService;
		const guild = interaction.guild;
		const member = interaction.member;

		switch (action) {
			case 'open': {
				await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
				const result = await ticketService.createTicket(guild, member);
				if (!result.ok) {
					await interaction.editReply(ticketMessageView(`${emoji('error')} ${result.reason}`));
					return;
				}
				await interaction.editReply(ticketMessageView(`${emoji('success')} 티켓 채널이 개설되었어요: <#${result.channel.id}>`));
				return;
			}

			case 'close': {
				// 확인 프롬프트 전송
				const confirmPayload = ticketCloseConfirmView();
				await interaction.reply(confirmPayload);
				return;
			}

			case 'cancelClose': {
				await interaction.update(ticketMessageView('티켓 닫기를 취소했어요.'));
				return;
			}

			case 'confirmClose': {
				// 확인 프롬프트 자체를 결과로 교체해 버튼이 남아 재클릭되지 않게 해요.
				await interaction.deferUpdate();
				const result = await ticketService.closeTicket(guild, interaction.channelId, member);
				if (!result.ok) {
					await interaction.editReply(ticketMessageView(`${emoji('error')} ${result.reason}`));
					return;
				}
				await interaction.editReply(ticketMessageView(`${emoji('success')} 티켓이 성공적으로 닫혔어요.`));
				return;
			}

			case 'claim': {
				await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
				const result = await ticketService.toggleClaim(guild, interaction.channelId, member);
				if (!result.ok) {
					await interaction.editReply(ticketMessageView(`${emoji('error')} ${result.reason}`));
					return;
				}
				const isClaimed = Boolean(result.ticket.claimedById);
				await interaction.editReply(
					ticketMessageView(
						isClaimed ? `${emoji('success')} 이 티켓의 담당자로 등록되었어요.` : `${emoji('success')} 티켓 담당을 해제했어요.`
					)
				);
				return;
			}
		}
	}
}
