import { notice } from '../view/notice.ts';
import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { findMessagesToPurge } from '../utils/purgeMessages.ts';
import { confirmAction } from '../../../lib/confirmation.ts';

/** Discord bulk-delete API는 14일이 지난 메시지를 삭제할 수 없어요 */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'purge',
	description: 'Bulk-delete recent messages in this channel (within 14 days).',
	fullCategory: ['일반']
})
export class PurgeCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
				.setName(this.name)
				.setNameLocalizations({ ko: '청소' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '최근 14일 이내의 메시지를 확인 후 삭제해요.' })
				.addIntegerOption((option) =>
					option
						.setName('amount')
						.setNameLocalizations({ ko: '수량' })
						.setDescription('삭제할 메시지 수예요. (1~100)')
						.setDescriptionLocalizations({ ko: '삭제할 메시지 수예요. (1~100)' })
						.setRequired(true)
						.setMinValue(1)
						.setMaxValue(100)
				)
				.addUserOption((option) =>
					option
						.setName('user')
						.setNameLocalizations({ ko: '대상' })
						.setDescription('이 사용자의 메시지만 삭제해요. (선택)')
						.setDescriptionLocalizations({ ko: '이 사용자의 메시지만 삭제해요. (선택)' })
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'purge_not_in_guild',
				message: `${emoji('error')} 서버 안에서만 사용할 수 있어요.`,
				context: { ephemeral: true }
			});
		}

		if (!(interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ?? false)) {
			throw new UserError({
				identifier: 'purge_no_permission',
				message: `${emoji('error')} 메시지 관리(Manage Messages) 권한이 필요해요.`,
				context: { ephemeral: true }
			});
		}

		const channel = interaction.channel;
		if (!channel || !('bulkDelete' in channel) || typeof channel.bulkDelete !== 'function') {
			throw new UserError({
				identifier: 'purge_unsupported_channel',
				message: `${emoji('error')} 이 채널에서는 메시지를 일괄 삭제할 수 없어요.`,
				context: { ephemeral: true }
			});
		}

		const amount = interaction.options.getInteger('amount', true);
		const target = interaction.options.getUser('user');

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		try {
			let deleted = 0;
			const result = await findMessagesToPurge(
				async (limit, before) => [...(await channel.messages.fetch({ limit, before })).values()],
				amount,
				target?.id
			);
			if (result.messages.length === 0) {
				await interaction.editReply({
					flags: [MessageFlags.IsComponentsV2],
					components: [
						notice(
							`${emoji('trash')} 삭제할 메시지가 없어요.${target ? ' 대상의 최근 메시지가 없거나,' : ''} 14일이 지난 메시지는 삭제할 수 없어요.`
						)
					]
				});
				return;
			}

			if (
				!(await confirmAction(
					interaction,
					'메시지를 삭제할까요?',
					`${target ? `${target.username} 님의` : '이 채널의'} 메시지 **${result.messages.length}개**를 삭제해요. 되돌릴 수 없어요.\n최근 ${result.scanned}개를 확인했어요. 14일이 지난 메시지는 제외해요.${result.limitReached ? '\n한 번에 최근 1,000개까지만 검색해요.' : ''}`
				))
			)
				return;
			deleted = (
				await channel.bulkDelete(
					result.messages.filter((message) => Date.now() - message.createdTimestamp < MAX_AGE_MS),
					true
				)
			).size;
			const note =
				deleted < amount ? `\n-# 요청 ${amount}개 중 ${deleted}개 삭제. 검색 범위 안의 대상 메시지와 14일 제한을 적용한 결과예요.` : '';
			await interaction.editReply({
				flags: [MessageFlags.IsComponentsV2],
				components: [notice(`${emoji('trash')} 메시지 **${deleted}개**를 삭제했어요.${note}`)]
			});
		} catch {
			await interaction
				.editReply({
					flags: [MessageFlags.IsComponentsV2],
					components: [notice(`${emoji('error')} 메시지를 삭제하지 못했어요. 봇의 메시지 관리 권한과 채널 상태를 확인해 주세요.`)]
				})
				.catch(() => undefined);
		}
	}
}
