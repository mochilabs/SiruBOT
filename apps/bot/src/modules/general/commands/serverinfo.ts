import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	GuildPremiumTier,
	MessageFlags,
	SectionBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder
} from 'discord.js';

const PREMIUM_TIER_LABELS: Record<GuildPremiumTier, string> = {
	[GuildPremiumTier.None]: '없음',
	[GuildPremiumTier.Tier1]: '레벨 1',
	[GuildPremiumTier.Tier2]: '레벨 2',
	[GuildPremiumTier.Tier3]: '레벨 3'
};

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'serverinfo',
	description: '현재 서버의 정보를 보여줘요.'
})
export class ServerInfoCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '서버정보' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '현재 서버의 정보를 보여줘요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		await interaction.deferReply();

		const guild = interaction.guild;
		const owner = await guild.fetchOwner();
		const createdAt = Math.floor(guild.createdTimestamp / 1000);

		const lines = [
			`### 🏠 ${guild.name}`,
			``,
			`👑 **소유자**: ${owner.user.tag}`,
			`👥 **멤버**: ${guild.memberCount.toLocaleString()}명`,
			`💬 **채널**: ${guild.channels.cache.size}개`,
			`😀 **이모지**: ${guild.emojis.cache.size}개`,
			`🎭 **역할**: ${guild.roles.cache.size}개`,
			`✨ **부스트**: ${PREMIUM_TIER_LABELS[guild.premiumTier]} (${guild.premiumSubscriptionCount ?? 0}개)`,
			`📅 **생성일**: <t:${createdAt}:F> (<t:${createdAt}:R>)`,
			`🆔 **서버 ID**: \`${guild.id}\``
		];

		const containerComponent = createContainer();

		if (guild.iconURL()) {
			const section = new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
				.setThumbnailAccessory(new ThumbnailBuilder().setURL(guild.iconURL({ size: 256 })!));
			containerComponent.addSectionComponents(section);
		} else {
			containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
		}

		await interaction.editReply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
