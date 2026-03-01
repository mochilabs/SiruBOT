import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	MessageFlags,
	SectionBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder
} from 'discord.js';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'userinfo',
	description: '유저의 정보를 보여줘요.'
})
export class UserInfoCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '유저정보' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '유저의 정보를 보여줘요.' })
				.addUserOption((option) =>
					option
						.setName('user')
						.setNameLocalizations({ ko: '유저' })
						.setDescription('The user to show info for.')
						.setDescriptionLocalizations({ ko: '정보를 확인할 유저에요.' })
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const user = interaction.options.getUser('user') ?? interaction.user;
		const member = interaction.guild.members.cache.get(user.id);

		const createdAt = Math.floor(user.createdTimestamp / 1000);
		const joinedAt = member?.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

		const lines = [`### 👤 ${user.tag}`, ``];

		lines.push(`🆔 **유저 ID**: \`${user.id}\``);
		lines.push(`📅 **계정 생성일**: <t:${createdAt}:F> (<t:${createdAt}:R>)`);

		if (joinedAt) {
			lines.push(`📥 **서버 참가일**: <t:${joinedAt}:F> (<t:${joinedAt}:R>)`);
		}

		if (member) {
			const roles = member.roles.cache
				.filter((role) => role.id !== interaction.guildId)
				.sort((a, b) => b.position - a.position)
				.map((role) => `<@&${role.id}>`)
				.slice(0, 10);

			if (roles.length > 0) {
				const roleText = roles.join(', ');
				const totalRoles = member.roles.cache.size - 1; // exclude @everyone
				lines.push(`🎭 **역할** (${totalRoles}개): ${roleText}${totalRoles > 10 ? ` 외 ${totalRoles - 10}개` : ''}`);
			}

			if (member.premiumSinceTimestamp) {
				const boostSince = Math.floor(member.premiumSinceTimestamp / 1000);
				lines.push(`✨ **부스터**: <t:${boostSince}:R>부터`);
			}
		}

		const avatarUrl = user.displayAvatarURL({ size: 256 });
		const containerComponent = createContainer();

		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
		containerComponent.addSectionComponents(section);

		await interaction.reply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
