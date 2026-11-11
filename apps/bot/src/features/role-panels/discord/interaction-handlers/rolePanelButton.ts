import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, MessageFlags } from 'discord.js';
import { parseRolePanelCustomId } from '@sirubot/utils/rolePanel';
import { emoji } from '@sirubot/utils';
import { ticketMessageView } from '../../../tickets/index.ts';

/**
 * 역할 패널 버튼 핸들러 — `rolepanel:grant:<buttonId>:<roleId>` customId를 파싱해 역할을 토글해요.
 *
 * DB가 진실의 원천이에요. 다음이 모두 맞을 때만 동작하고, 하나라도 어긋나면 낡은 메시지로 보고 거부해요:
 *  - 버튼이 아직 존재하고, 소속 패널이 이 길드 것이다.
 *  - 클릭된 메시지가 패널의 현재 게시 메시지다 (재게시로 대체된 옛 메시지 차단).
 *  - customId에 박힌 roleId가 DB 버튼의 roleId와 같다 (역할이 바뀐 뒤 갱신 전 메시지 차단).
 * 부여·제거는 customId가 아닌 DB 버튼의 roleId로 해요.
 */
export default class RolePanelButtonHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, {
			...options,
			interactionHandlerType: InteractionHandlerTypes.Button
		});
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		const parsed = parseRolePanelCustomId(interaction.customId);
		if (!parsed) return this.none();
		return this.some(parsed);
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
