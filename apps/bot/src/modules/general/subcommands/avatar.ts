import { emoji, createContainer } from '@sirubot/utils';
import {
	ChatInputCommandInteraction,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	MessageFlags,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandBuilder,
	TextDisplayBuilder
} from 'discord.js';

export const name = 'avatar';
export const ko = '아바타';
export const description = '사용자의 아바타를 보여줘요.';
export const preconditions: string[] = [];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	const named = sub.setName(name).setNameLocalizations({ ko }).setDescription(description).setDescriptionLocalizations({ ko: description });
	withOptions(named);
	return named;
}

/** 옵션만 붙여요 — `/아바타` top-level 커맨드가 같은 옵션 정의를 재사용해요 */
export function withOptions<T extends SlashCommandSubcommandBuilder | SlashCommandOptionsOnlyBuilder>(builder: T): void {
	builder
		.addUserOption((option) =>
			option
				.setName('user')
				.setNameLocalizations({ ko: '유저' })
				.setDescription('The user whose avatar to show.')
				.setDescriptionLocalizations({ ko: '아바타를 확인할 유저에요.' })
		)
		.addBooleanOption((option) =>
			option
				.setName('server')
				.setNameLocalizations({ ko: '서버아바타' })
				.setDescription('Show server-specific avatar if available.')
				.setDescriptionLocalizations({ ko: '서버 아바타가 있으면 서버 아바타를 보여줘요.' })
		);
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	const user = interaction.options.getUser('user') ?? interaction.user;
	const showServerAvatar = interaction.options.getBoolean('server') ?? false;
	const member = interaction.guild.members.cache.get(user.id);

	let avatarUrl: string;
	let label: string;

	if (showServerAvatar && member?.avatar) {
		avatarUrl = member.displayAvatarURL({ size: 4096 });
		label = `${user.tag}의 서버 아바타`;
	} else {
		avatarUrl = user.displayAvatarURL({ size: 4096 });
		label = `${user.tag}의 아바타`;
	}

	const containerComponent = createContainer();
	containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${emoji('frame')} ${label}`));

	const gallery = new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(avatarUrl));
	containerComponent.addMediaGalleryComponents(gallery);

	await interaction.reply({
		components: [containerComponent],
		flags: [MessageFlags.IsComponentsV2]
	});
}
