import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, MessageFlags } from 'discord.js';
import { ticketId } from '../customIds.ts';
import { emoji } from '@sirubot/utils';
import { confirmAction } from '../../../../lib/confirmation.ts';
import { ticketMessageView } from '../views/ticket.ts';

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
				// 확인은 공용 confirmAction으로 받고, 결과는 같은 ephemeral 응답에 이어서 보여줘요.
				await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
				const confirmed = await confirmAction(
					interaction,
					`${emoji('lock')} 티켓을 닫으시겠어요?`,
					'닫기를 누르면 유저의 채널 접근이 종료되고 티켓이 마감돼요.'
				);
				if (!confirmed) return;
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
