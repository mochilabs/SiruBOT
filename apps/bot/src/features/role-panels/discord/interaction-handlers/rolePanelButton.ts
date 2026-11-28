import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, MessageFlags } from 'discord.js';
import { rolePanelId } from '../customIds.ts';
import { emoji } from '@sirubot/utils';
import { ticketMessageView } from '../../../tickets/index.ts';

export default class RolePanelButtonHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.Button
		});
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		const decoded = rolePanelId.decode(interaction.customId);
		if (!decoded) return this.none();
		return this.some({ buttonId: decoded.buttonId, roleId: decoded.roleId });
	}

	public async run(interaction: ButtonInteraction<'cached'>, { buttonId, roleId }: { buttonId: string; roleId: string }) {
		const service = this.container.rolePanelService;
		const guild = interaction.guild;

		const button = await service.getButton(buttonId);
		const live =
			button !== null && button.panel.guildId === guild.id && button.panel.messageId === interaction.message.id && button.roleId === roleId;
		if (!button || !live) {
			await interaction.reply({
				...ticketMessageView(`${emoji('error')} 이 버튼은 더 이상 사용할 수 없어요.`),
				flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
			});
			return;
		}

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		const result = await service.toggleRole(guild, interaction.member, button.panelId, button.roleId);
		if (!result.ok) {
			await interaction.editReply(ticketMessageView(`${emoji('error')} ${result.reason}`));
			return;
		}

		await interaction.editReply(
			ticketMessageView(
				result.added
					? `${emoji('success')} <@&${button.roleId}> 역할을 받았어요.`
					: `${emoji('success')} <@&${button.roleId}> 역할을 해제했어요.`
			)
		);
	}
}
