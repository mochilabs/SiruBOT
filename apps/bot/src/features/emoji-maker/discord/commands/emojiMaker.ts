import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, type Attachment } from 'discord.js';
import { MAX_DESCRIPTION_LENGTH } from '../../application/emojiMaker.ts';
import { MAX_IMAGE_BYTES, normalizeImageType } from '../../../../lib/imageDataUrl.ts';
import { runEmojiMakerSession } from '../emojiMakerSession.ts';

@ApplyOptions<Command.Options>({
	name: 'emojimaker',
	description: 'Draw a pixel-art emoji from a description or an image and add it to the server.',
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
				.setDescriptionLocalizations({ ko: '설명이나 이미지로 픽셀 이모지를 그려 주고, 마음에 드는 걸 서버 이모지로 등록해요.' })
				.addStringOption((option) =>
					option
						.setName('description')
						.setNameLocalizations({ ko: '설명' })
						.setDescription('What to draw, e.g. "cat wearing sunglasses".')
						.setDescriptionLocalizations({
							ko: '그릴 내용 (예: 선글라스 낀 고양이). 이미지를 첨부하면 무엇을 그릴지 고르는 메모가 돼요.'
						})
						.setMaxLength(MAX_DESCRIPTION_LENGTH)
						.setRequired(false)
				)
				.addAttachmentOption((option) =>
					option
						.setName('image')
						.setNameLocalizations({ ko: '이미지' })
						.setDescription('A PNG, JPG or WEBP image to turn into an emoji. NSFW images are rejected.')
						.setDescriptionLocalizations({ ko: '이모지로 만들 PNG·JPG·WEBP 이미지 (부적절한 이미지는 거절해요)' })
						.setRequired(false)
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
		const description = interaction.options.getString('description');
		const image = interaction.options.getAttachment('image');
		if (!description?.trim() && !image) {
			throw new UserError({
				identifier: 'emojimaker_empty',
				message: `${emoji('error')} 그릴 내용을 설명하거나 이미지를 첨부해 주세요.`,
				context: { ephemeral: true }
			});
		}
		if (image) this.assertImage(image);
		await interaction.deferReply();
		await runEmojiMakerSession(interaction, this.container.emojiMaker, this.container.logger, {
			description,
			imageUrl: image?.url ?? null,
			imageType: image?.contentType ?? null
		});
	}

	/** 비전 모델에 보낼 수 있는 이미지인지 — PNG·JPG·WEBP, 10MB 이하, 이미지 판독이 켜져 있어야 해요. */
	private assertImage(image: Attachment) {
		if (!this.container.emojiMaker.canReadImages()) {
			throw new UserError({
				identifier: 'emojimaker_image_disabled',
				message: `${emoji('error')} 이 봇에서는 이미지로 이모지 만들기가 꺼져 있어요. 설명으로 만들어 주세요.`,
				context: { ephemeral: true }
			});
		}
		if (!normalizeImageType(image.contentType) || image.size > MAX_IMAGE_BYTES) {
			throw new UserError({
				identifier: 'emojimaker_bad_image',
				message: `${emoji('error')} 10MB 이하의 PNG·JPG·WEBP 이미지만 쓸 수 있어요.`,
				context: { ephemeral: true }
			});
		}
	}
}
