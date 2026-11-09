import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { openPlaylistPanel } from '../view/playlistPanel.ts';
import { playSavedTracks } from '../../../services/playlistPlayback.ts';
import { notice } from '../../general/view/notice.ts';

@ApplyOptions<Command.Options>({ name: 'favorites', description: 'Manage your favorite tracks.', fullCategory: ['음악'] })
export class FavoritesCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '즐겨찾기' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '즐겨찾기를 관리해요.' })
				.addSubcommand((sub) =>
					sub
						.setName('add')
						.setNameLocalizations({ ko: '추가' })
						.setDescription('Add the currently playing track to your favorites.')
						.setDescriptionLocalizations({ ko: '현재 재생 중인 곡을 즐겨찾기에 추가해요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('remove')
						.setNameLocalizations({ ko: '삭제' })
						.setDescription('Choose a favorite track to remove.')
						.setDescriptionLocalizations({ ko: '목록에서 삭제할 곡을 선택해요. 재생 중이 아니어도 돼요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('list')
						.setNameLocalizations({ ko: '목록' })
						.setDescription('Show your favorite tracks.')
						.setDescriptionLocalizations({ ko: '즐겨찾기 목록을 보여줘요.' })
						.addIntegerOption((option) =>
							option
								.setName('page')
								.setNameLocalizations({ ko: '페이지' })
								.setDescription('Page number to display.')
								.setDescriptionLocalizations({ ko: '표시할 페이지 번호에요.' })
								.setMinValue(1)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('play')
						.setNameLocalizations({ ko: '재생' })
						.setDescription('Play all your favorite tracks.')
						.setDescriptionLocalizations({ ko: '즐겨찾기의 모든 곡을 재생해요.' })
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		await this.container.playlistService.getOrCreateFavoritesPlaylist(interaction.user.id);
		const sub = interaction.options.getSubcommand(true);
		if (sub === 'list' || sub === 'remove')
			return openPlaylistPanel(interaction, { name: '즐겨찾기', page: interaction.options.getInteger('page') ?? 1 });
		if (sub === 'add') {
			const current = this.container.audio.getPlayer(interaction.guildId)?.queue.current;
			if (!current || !('encoded' in current))
				throw new UserError({
					identifier: 'favorites_no_track',
					message: '현재 곡이 없어요. /즐겨찾기 목록의 곡 추가 버튼으로 제목이나 주소를 입력해 주세요.',
					context: { ephemeral: true }
				});
			await this.container.playlistService.addTrack(interaction.user.id, '즐겨찾기', current);
			await interaction.editReply({
				components: [notice(`**${current.info.title}**을(를) 즐겨찾기에 추가했어요.`)],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { parse: [] }
			});
			return;
		}
		const { tracks } = await this.container.playlistService.getPlaylistTracks(interaction.user.id, '즐겨찾기');
		const feedback = await playSavedTracks(interaction, tracks);
		await interaction.editReply({ components: [notice(feedback)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
	}
}
