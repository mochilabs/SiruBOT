import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction } from 'discord.js';
import { MAX_DESCRIPTION_LENGTH } from '../../application/emojiMaker.ts';
import { runEmojiMakerSession } from '../emojiMakerSession.ts';

@ApplyOptions<Command.Options>({
	name: 'emojimaker',
	description: 'Draw a pixel-art emoji from a description and add it to the server.',
	fullCategory: ['일반']
})
export class EmojiMakerCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '이모지만들기' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '설명대로 픽셀 이모지를 그려 주고, 마음에 드는 걸 서버 이모지로 등록해요.' })
				.addStringOption((option) =>
					option
						.setName('description')
						.setNameLocalizations({ ko: '설명' })
						.setDescription('What to draw, e.g. "cat wearing sunglasses".')
						.setDescriptionLocalizations({ ko: '그릴 내용 (예: 선글라스 낀 고양이). 영어로 쓰면 더 잘 그려요.' })
						.setMaxLength(MAX_DESCRIPTION_LENGTH)
						.setRequired(true)
				)
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'emojimaker_not_in_guild',
				message: `${emoji('error')} 서버에서만 쓸 수 있어요.`,
				context: { ephemeral: true }
			});
		}
		if (!this.container.emojiMaker.isEnabled()) {
			throw new UserError({
				identifier: 'emojimaker_disabled',
				message: `${emoji('error')} 이 봇에서는 이모지 생성이 꺼져 있어요.`,
				context: { ephemeral: true }
			});
		}
		await interaction.deferReply();
		await runEmojiMakerSession(interaction, this.container.emojiMaker, this.container.logger, interaction.options.getString('description', true));
	}
}
