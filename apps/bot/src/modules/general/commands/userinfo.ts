import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';

/**
 * @deprecated `/프로필 보기`로 이동했어요. 이 명령어는 다음 릴리즈에서 삭제돼요.
 */
@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'userinfo',
	description: '유저의 정보를 보여줘요. (곧 /프로필 보기로 이동해요)'
})
export class UserInfoCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '유저정보' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '유저의 정보를 보여줘요. (곧 /프로필 보기로 이동해요)' })
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
		const user = interaction.options.getUser('user');
		const mention = user ? ` <@${user.id}>` : '';
		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents((t) =>
			t.setContent(
				[
					'### 📦 `/유저정보`가 이사했어요',
					'',
					`앞으로는 **/프로필 보기${mention ? ` 유저:${mention}` : ''}** 를 써주세요.`,
					'계정·서버·역할 정보에 음악 기록까지 함께 보여줘요.'
				].join('\n')
			)
		);
		await interaction.reply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
		});
	}
}
