import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ButtonInteraction, MessageFlags } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { notice } from '../../../../lib/notice.ts';
import { giveawayId } from '../customIds.ts';
import { giveawayNoticeView } from '../views/giveawayViews.ts';

type GiveawayAction = NonNullable<ReturnType<typeof giveawayId.decode>>;

/**
 * 나눔 카드 버튼 — `giveaway:v1:enter:{id}`는 참여, 이미 참여한 사람이 다시 누르면 취소 확인(`leave`)을 보여줘요.
 * 참여는 DB insert 한 번이고, 카드 숫자는 서비스가 10초에 한 번만 고쳐요.
 */
export default class GiveawayButtonHandler extends InteractionHandler {
	public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
		super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
	}

	public override parse(interaction: ButtonInteraction) {
		if (!interaction.inCachedGuild()) return this.none();
		const decoded = giveawayId.decode(interaction.customId);
		return decoded ? this.some(decoded) : this.none();
	}

	public async run(interaction: ButtonInteraction<'cached'>, decoded: GiveawayAction) {
		const service = this.container.giveaways;
		const { guildId, user, member } = interaction;

		if (decoded.action === 'leave') {
			const left = await service.leave(decoded.id, guildId, user.id);
			await interaction.update(
				giveawayNoticeView(left ? `${emoji('success')} 참여를 취소했어요.` : `${emoji('info')} 이미 끝났거나 참여 기록이 없어요.`)
			);
			return;
		}

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		const result = await service.enter(decoded.id, guildId, user.id, {
			roleIds: [...member.roles.cache.keys()],
			joinedAt: member.joinedAt,
			accountCreatedAt: user.createdAt
		});

		switch (result.kind) {
			case 'entered':
				await interaction.editReply(giveawayNoticeView(`${emoji('party')} 참여했어요! 결과는 마감 후 발표돼요.`));
				return;
			case 'closed':
				await interaction.editReply(giveawayNoticeView(`${emoji('info')} 이미 끝났거나 취소된 나눔이에요.`));
				return;
			case 'ineligible':
				await interaction.editReply(
					giveawayNoticeView(`${emoji('error')} 참여 조건을 채우지 못했어요.\n${result.reasons.map((reason) => `- ${reason}`).join('\n')}`)
				);
				return;
			case 'already':
				await interaction.editReply({
					flags: MessageFlags.IsComponentsV2,
					components: [
						notice(`${emoji('info')} 이미 참여했어요. 참여를 취소할까요?`).addActionRowComponents(
							new ActionRowBuilder<ButtonBuilder>().addComponents(
								new ButtonBuilder()
									.setCustomId(giveawayId.encode('leave', { id: decoded.id }))
									.setLabel('참여 취소')
									.setStyle(ButtonStyle.Danger)
							)
						)
					]
				});
				return;
		}
	}
}
