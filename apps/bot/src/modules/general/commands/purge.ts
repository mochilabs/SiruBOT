import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';

/** Discord bulk-delete API는 14일이 지난 메시지를 삭제할 수 없어요 */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'purge',
	description: '채널의 최근 메시지를 일괄 삭제해요. (14일 이내)',
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
				.setDescriptionLocalizations({ ko: this.description, 'en-US': 'Bulk-delete recent messages in this channel. (within 14 days)' })
				.addIntegerOption((option) =>
					option
						.setName('amount')
						.setNameLocalizations({ ko: '수량' })
						.setDescription('삭제할 메시지 수예요. (1~100)')
						.setDescriptionLocalizations({ ko: '삭제할 메시지 수예요. (1~100)', 'en-US': 'Number of messages to delete (1-100).' })
						.setRequired(true)
						.setMinValue(1)
						.setMaxValue(100)
				)
				.addUserOption((option) =>
					option
						.setName('user')
						.setNameLocalizations({ ko: '대상' })
						.setDescription('이 사용자의 메시지만 삭제해요. (선택)')
						.setDescriptionLocalizations({ ko: '이 사용자의 메시지만 삭제해요. (선택)', 'en-US': 'Only delete messages from this user.' })
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'purge_not_in_guild',
				message: '❌ 서버 안에서만 사용할 수 있어요.',
				context: { ephemeral: true }
			});
		}

		if (!(interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ?? false)) {
			throw new UserError({
				identifier: 'purge_no_permission',
				message: '❌ 메시지 관리(Manage Messages) 권한이 필요해요.',
				context: { ephemeral: true }
			});
		}

		const channel = interaction.channel;
		if (!channel || !('bulkDelete' in channel) || typeof channel.bulkDelete !== 'function') {
			throw new UserError({
				identifier: 'purge_unsupported_channel',
				message: '❌ 이 채널에서는 메시지를 일괄 삭제할 수 없어요.',
				context: { ephemeral: true }
			});
		}

		const amount = interaction.options.getInteger('amount', true);
		const target = interaction.options.getUser('user');

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		try {
			let deleted = 0;
			const fetched = await channel.messages.fetch({ limit: amount });
			const ageFiltered = fetched.filter((m) => Date.now() - m.createdTimestamp < MAX_AGE_MS);
			// 14일이 지난 메시지는 bulkDelete가 조용히 제외하므로 미리 센다
			const ageSkipped = fetched.size - ageFiltered.size;
			const candidates = target ? ageFiltered.filter((m) => m.author.id === target.id) : ageFiltered;
			if (candidates.size > 0) deleted = (await channel.bulkDelete(candidates, true)).size;

			if (deleted === 0) {
				await interaction.editReply({
					content: `🗑️ 삭제할 메시지가 없어요.${target ? ' 대상의 최근 메시지가 없거나,' : ''} 14일이 지난 메시지는 삭제할 수 없어요.`
				});
				return;
			}

			const note = ageSkipped > 0 ? `\n-# 14일이 지난 메시지 ${ageSkipped}개는 건너떴어요.` : '';
			await interaction.editReply({ content: `🗑️ 메시지 **${deleted}개**를 삭제했어요.${note}` });
		} catch {
			await interaction
				.editReply({ content: '❌ 메시지를 삭제하지 못했어요. 봇의 메시지 관리 권한과 채널 상태를 확인해 주세요.' })
				.catch(() => undefined);
		}
	}
}
